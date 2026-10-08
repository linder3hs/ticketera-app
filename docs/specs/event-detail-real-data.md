# Detalle de evento con datos reales, URL por slug y enlaces de la landing

Estado: aprobada

## Objetivo

Hoy el detalle público `/events/[id]` y sus rutas hijas (`/tickets`, `/checkout` y `/confirmation`) leen del mock (`event-service.ts` + `venue-service.ts`). Esta spec hace tres cosas:

- pasa esas rutas a leer de Postgres/Drizzle;
- cambia la clave de la URL de `id` a `slug`: `/events/[slug]`, por decisión del humano del 2026-10-05;
- vuelve a enlazar la landing, que dejó de enlazar por la Pregunta 1 = C de `landing-real-data-featured.md`.

Es una tarea **de solo lectura**: no hay escrituras nuevas en la DB.

Referencias (consultar solo estas secciones):
- `erd.md §3`, grupos **Recinto** y **Evento**: columnas de `venue`, `venue_zone`, `venue_seat`, `event`, `event_zone` y `event_seat`.
  - `event.slug` es `UQ`, así que identifica a un evento.
  - "Agotado/Últimas entradas se derivan de disponibilidad, no se almacenan".
- `erd.md §2`: enums `event_status`, `event_seat_status` y `seating_type`.
- `system-design.md §3`, "Reglas de límite": los services no importan `next/*` y `src/app` no contiene lógica de dominio.
- Specs aprobadas en las que se apoya:
  - `landing-real-data-featured.md`: "Definiciones" (visible en público, ocupación, capacidad, disponibilidad), la convención `imageUrl === ""` = sin portada y `unoptimized` sin abrir `remotePatterns`.
  - `event-detail-seat-selection.md`: la forma del mapa (`VenueMap`).
- Next 16 (`node_modules/next/dist/docs/01-app/`; versión instalada 16.3.6):
  - `03-api-reference/03-file-conventions/dynamic-routes.md`:
    - `params` es una `Promise` y se tipa con `PageProps<"/events/[slug]">`;
    - sin `generateStaticParams` y sin Cache Components, la ruta se renderiza en cada request.
  - `03-api-reference/05-config/02-typescript.md` ("Route-Aware Type Helpers") y `03-api-reference/06-cli/next.md` (`next typegen`):
    - `PageProps` es un helper global que se genera con `next dev`, `next build` o `next typegen`;
    - `next typegen` existe desde 15.5 y escribe `.next/types/routes.d.ts` y `.next/types/validator.ts`;
    - la doc recomienda `next typegen && tsc --noEmit`.
  - `03-api-reference/04-functions/generate-metadata.md`: React `cache` sirve para deduplicar una lectura que no es `fetch`.
  - `03-api-reference/04-functions/not-found.md`.
  - `03-api-reference/02-components/image.md` (`unoptimized`).

### Decisiones (resueltas por el humano; ver "Preguntas abiertas")

- **D1 = A, flujo de compra completo en lectura.** `/events/[slug]`, `/tickets`, `/checkout` y `/confirmation` leen el evento y el mapa real de la DB. La selección sigue en el navegador (`booking.store`) y el pago sigue simulado hasta la tarea 05.
- **D2 = la URL usa `slug`** (Pregunta 2, decisión del humano).
  - El segmento dinámico es `[slug]` y el campo que lleva el parámetro de ruta es **`Event.slug`**, que es `event.slug` en la DB. `Event` gana `slug: string` requerido.
  - **`Event.id` sigue siendo la identidad interna** (ver la definición "Identidad interna vs. URL").
  - La carpeta `src/app/(platform)/events/[id]` se reemplaza por `[slug]`, y los 4 literales pasan a `PageProps<"/events/[slug]…">`. No pueden coexistir: Next rechaza dos segmentos dinámicos hermanos con distinto nombre ("You cannot use different slug names for the same dynamic path").
  - Todos los href públicos al detalle y a la compra se construyen con el slug (tabla en "Alcance → Enlaces por slug").
- **D3 = 404 para todo lo que no sea visible en público.** Visible en público es lo mismo que en la landing: `status = 'published'` y `starts_at > now` (`isPublic(now)` de `event-public-service.ts`). Dan `notFound()`:
  - `draft`, `cancelled` y `finished`;
  - `published` ya empezado;
  - un slug con formato válido que no existe (incluidos `evt-001` y un UUID);
  - un parámetro con formato de slug inválido.

  La variante "aviso de cancelado/finalizado" queda propuesta para una fase posterior.

### Definiciones

- **Slug válido**: `isEventSlug(slug)` = `EVENT_SLUG_PATTERN.test(slug)`, con `EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/`.
  - Es el formato que producen `slugify` (`src/lib/utils.ts`: palabras `[a-z0-9]` unidas por `-`, sin guiones en los bordes) y `nextAvailableSlug` (`event-write.utils.ts`: sufijos `-2`, `-3`…; una base vacía cae en `event`).
  - Con un slug inválido, `getPublicEventDetail` devuelve `undefined` **sin consultar la DB**, y la página da `notFound()`.
  - La columna es `text`, así que un formato raro no rompe la consulta como pasaba con `uuid`. La guarda sigue haciendo falta por dos motivos:
    - Postgres rechaza `\u0000` en `text`, así que `/events/%00` sería un 500;
    - evita ir a la DB con entradas que no pueden existir.
  - **Sin tope de largo.** `title` solo tiene `.min(3)` (`event-write.schema.ts:60`), así que el slug no tiene máximo y un tope podría dar 404 a un evento real. La regex es lineal: cada grupo repetido empieza con un `-` obligatorio, así que no hay backtracking catastrófico.
  - Un UUID en minúsculas y `evt-001` **pasan** la guarda: se busca por `slug`, no hay fila y la página da 404. Un UUID en mayúsculas no pasa.
- **Identidad interna vs. URL.** El slug es solo la clave de la URL y de la búsqueda del detalle. Todo lo demás sigue con `Event.id`:
  - `booking.store`: `init(event.id)` y el `eventId` persistido;
  - `isCurrent = store.eventId === event.id` en `TicketSelection.tsx:30` y `CheckoutForm.tsx:122`;
  - `order.eventId !== event.id` en `OrderConfirmation.tsx:37` y `Order.eventId` en `booking.types.ts`;
  - `getEventVenueMap(event: Pick<Event, "id" | "currency">)` y `VenueMap.eventId`;
  - `listRelatedEvents(eventId)` y las `key` de React;
  - `MOCK_ORDERS` (`evt-001`/`evt-004`) de `order-service.ts`, que `MyTickets.tsx:63` y `:114` cruzan con el `event.id` del mock;
  - la reserva de la tarea 05, que referenciará `event.id`/`event_zone.id`.

  El `id` es inmutable y es lo que referencian las FK del ERD; el slug es solo la cara pública. Por eso `booking.types.ts`, `booking.store.ts`, `order-service.ts`, `MyTickets.tsx` y `OrderConfirmation.tsx` no cambian. Verificado:
  - `OrderConfirmation` solo enlaza a `/` y a `/my-tickets`, y `MyTickets` solo a `/events`;
  - `TicketPass`, `TicketDetailCard` y `CheckoutHeader` no construyen href al evento;
  - `proxy.ts` no menciona `/events`.
- **Sin redirección desde URLs por UUID.** Nunca hubo URLs públicas por UUID: la landing no enlazaba y el detalle era el mock con `evt-00X`. No hay enlaces que preservar, así que un UUID da 404.
- **El slug no cambia al editar el título.** `updateEvent` (`event-write-service.ts:353`) no toca `slug`, así que la URL es estable aunque deje de coincidir con el título. Esta spec no cambia ese comportamiento.
- **Sin normalización.** `/events/Bad-Bunny-World-Tour` o una URL con acentos dan 404: no se pasa a minúsculas ni se redirige (YAGNI).
- **Capacidad, ocupación y disponibilidad de una zona**: los fragmentos `zoneCapacity`/`zoneOccupancy` de `event-facts-service.ts` y `availabilityStatus(capacidad, ocupación)` de `event-public.utils.ts`, por zona. La disponibilidad del evento suma todas sus zonas (`toPublicEvents`), igual que en la landing.
  - Un asiento `blocked` se ve ocupado en el mapa, pero no suma ocupación: `zoneOccupancy` cuenta solo `sold` + `held`, igual que en la landing.

## Alcance

- Incluye:
  - **`slug` en el tipo y en todos sus productores**, en una sola tarea (T1) para que compile en un paso:
    - `event.types.ts`:
      - `Event` gana `slug: string`, con un JSDoc: clave de la URL pública `/events/<slug>`; la identidad es `id`. `EventDetail` lo hereda y no gana otros campos.
      - Se agrega un JSDoc a `EventDetail.doorsOpenAt` que documenta el centinela `""`. No pasa a `string | null`, porque `seed-data.ts:128` lo usa como `string`.
    - `event-public.utils.ts`: `PublicEventRow` gana `slug: string` y `toPublicEvents` lo propaga (`slug: row.slug`).
    - `event-public-service.ts`: `selectPublicEvents` selecciona `slug: event.slug`.
    - Mock `src/modules/event/services/event-service.ts`: **solo** se agrega `slug` a los 10 literales de `EVENTS`.
      - El valor es `slugify(title)`, el mismo que siembra `seed-data.ts:131`, escrito como literal:

        | `id` | `slug` |
        |---|---|
        | `evt-001` | `bad-bunny-world-tour` |
        | `evt-002` | `festival-vive-latino-lima` |
        | `evt-003` | `clasico-peruano-universitario-vs-alianza-lima` |
        | `evt-004` | `romeo-y-julieta-obra-de-teatro` |
        | `evt-005` | `feria-familiar-de-verano` |
        | `evt-006` | `coldplay-music-of-the-spheres-world-tour` |
        | `evt-007` | `nba-global-games-exhibicion-de-basquet` |
        | `evt-008` | `festival-electronico-ultra-lima` |
        | `evt-009` | `concierto-sinfonico-de-ano-nuevo` |
        | `evt-010` | `circo-de-las-estrellas` |

      - `EVENT_DETAILS` no cambia: es `Omit<EventDetail, keyof Event>` y `slug` ya cae en `keyof Event`.
      - Se elige agregar `slug` al mock en vez de hacerlo opcional en `Event`. Un campo opcional obligaría a manejar `undefined` en cada href. Con el slug literal, las tarjetas de la búsqueda mock `/events` enlazan a `/events/<slug>`, que es el evento sembrado (ver Pregunta 8).
    - `event-search.test.ts`: la base del factory `event()` agrega `slug: "evento"`.
    - `src/modules/organizer/components/EventForm.tsx`: `previewEvent` agrega `slug: "preview"`. Es la vista previa (`EventCard preview`), que no enlaza.
  - **Lectura del detalle** en `event-public-service.ts` (se extiende; no se crea otro service):
    - `getPublicEventDetail(slug: string, now = new Date()): Promise<EventDetail | undefined>`.
      - Si `isEventSlug(slug)` es falso, devuelve `undefined` sin consultar la DB.
      - Si pasa, lee `event` ⨝ `venue` ⨝ `category` con `and(eq(event.slug, slug), isPublic(now))`, sobre el índice único de `slug`.
      - Las zonas salen de `selectPublicZones([row.id])` y el mapeo de `toPublicEventDetail`.
      - Recomendado, no obligatorio: envolverla con `cache` de `react` (no es `next/*`) para que `generateMetadata` y la página compartan una sola lectura por request.
        - La versión cacheada debe recibir solo `slug` y resolver `now = new Date()` adentro, p. ej. `cache((slug: string) => read(slug, new Date()))`.
        - `cache` compara los argumentos por identidad: si cada caller pasara su propio `Date`, nunca deduplicaría.
    - `listRelatedEvents(eventId: string, now = new Date()): Promise<Event[]>`.
      - Recibe el **`id` interno** del evento que ya devolvió `getPublicEventDetail`. No lleva guarda: ningún parámetro de URL llega aquí, porque el único caller es la página y la llama después del `notFound()`. El JSDoc documenta esa precondición.
      - Por eso desaparece el `isEventId` de la versión anterior de esta spec (YAGNI).
      - Usa `selectPublicEvents(and(isPublic(now), ne(event.id, eventId), <misma category_id que eventId>), RELATED_LIMIT)`.
      - La condición de categoría puede ser una subconsulta con `alias(event, …)` o una lectura previa, a criterio del developer.
      - Devuelve solo eventos de la misma categoría, por `starts_at` asc. No rellena con otras categorías como hace el mock.
  - **Mapeo DB → `EventDetail`** en `event-public.utils.ts`, como función pura `toPublicEventDetail(row: PublicEventDetailRow, zones: PublicZoneRow[]): EventDetail`:

    | Campo | Origen |
    |---|---|
    | Campos de `Event` | `toPublicEvents([row], zones)[0]`. Se reutilizan `slug`, `priceFrom`, `status`, `imageUrl` (`""` sin portada), `imageAlt` (`cover_alt ?? title`), `date` (`toLimaDate`), `category`, `venue`, `city`, `currency` y `featured` |
    | `description` | `event.description ?? ""` |
    | `startsAt` | `toLimaTime(event.starts_at)` (`HH:mm`) |
    | `doorsOpenAt` | `doors_open_at ? toLimaTime(doors_open_at) : ""`. `""` significa "sin hora anunciada": los eventos creados desde el panel no la tienen |
    | `minAge` | `event.min_age` (se conserva `null`) |
    | `address` | `venue.address` |

    - `PublicEventDetailRow` extiende `PublicEventRow` (que ya trae `slug`) con `description`, `doorsOpenAt: Date | null`, `minAge` y `address`.
    - También se agregan `EVENT_SLUG_PATTERN`, `isEventSlug(slug): boolean` y `RELATED_LIMIT = 4`.
    - `availabilityStatus`, `summarizeZones` y `toPublicEvents` mantienen su firma, porque T2 las importa. `toPublicEvents` solo agrega `slug` a su salida.
  - **Mapa del recinto desde la DB**, en el módulo `booking`, dueño de `VenueMap`:
    - `services/venue-map-service.ts` exporta `getEventVenueMap(event: Pick<Event, "id" | "currency">): Promise<VenueMap>`.
      - Recibe un evento **ya validado y visible**: la página lo llama después de `getPublicEventDetail`. Así la regla de visibilidad vive en un solo lugar y esta tarea no depende de T1. Usa el `id` interno, no el slug.
      - Hace dos consultas en paralelo:
        1. Zonas: `event_zone` ⨝ `venue_zone` del evento, con `capacity`/`occupied` vía `sql\`${zoneCapacity}\`.mapWith(Number)` (y lo mismo con `zoneOccupancy`), como en `selectPublicZones`. Orden: `venue_zone.sort_order`, `venue_zone.name`, `event_zone.id`, el mismo que `selectZoneStates`.
        2. Asientos: `event_seat` ⨝ `venue_seat` ⨝ `event_zone` del evento.
      - El mapeo va en `venue-map.utils.ts`, en `toVenueMap(event, zoneRows, seatRows)`.
    - Reglas de mapeo, sobre los tipos **existentes** de `booking.types.ts`:

      | Campo | Origen / regla |
      |---|---|
      | `VenueMap.eventId` | `event.id` |
      | `viewBox` | constante `VENUE_VIEWBOX = "0 0 800 540"` (no hay columna; es el mismo valor del mock) |
      | `stage` | constante `VENUE_STAGE = { x: 290, y: 28, width: 220, height: 46 }` (ídem) |
      | `Zone.id` | `event_zone.id` (lo que referenciará la reserva de la tarea 05) |
      | `Zone.name` | `event_zone.name` |
      | `Zone.shortName` | `shortZoneName(name)`: la última palabra (`"Tribuna Occidente"` → `"Occidente"`, `"VIP"` → `"VIP"`). Con el seed da los mismos valores que el mock. No hay columna |
      | `Zone.price` | `event_zone.price_cents / 100` |
      | `Zone.currency` | `event.currency` |
      | `Zone.color` | `venue_zone.color ?? DEFAULT_ZONE_COLOR` (`"#A1A1AA"`) |
      | `Zone.status` | `availabilityStatus(capacity, occupied)` de la zona |
      | `Zone.kind` | `seating_type`: `numbered` → `"seated"`, `general_admission` → `"general"` |
      | `Zone.shape` | `venue_zone.map_shape` (jsonb) validado como `{ path: string; labelX: number; labelY: number }`. Si es `null` o está mal formado → `EMPTY_ZONE_SHAPE = { path: "", labelX: 0, labelY: 0 }` |
      | `Zone.rows` | Solo zonas `seated`: sus asientos (por `event_zone_id`) agrupados por `row_label`. Filas en orden natural (`localeCompare(…, { numeric: true })`) y asientos por `seat_number` asc. Una `seated` sin asientos lleva `rows: []`; las `general` no llevan `rows` |
      | `Seat.id` | `event_seat.id` |
      | `Seat.row` / `Seat.number` | `venue_seat.row_label` / `venue_seat.seat_number` |
      | `Seat.x` / `Seat.y` | `venue_seat.x ?? 0` / `venue_seat.y ?? 0` |
      | `Seat.status` | `event_seat.status = 'available'` → `"available"`; `held`, `sold` y `blocked` → `"occupied"` |

      `toVenueMap` conserva el orden de zonas que trae la consulta.
  - **Enlaces por slug.** Lista verificada con `grep -rn '/events/\${' src`; `CheckoutHeader` recibe el href por prop y no cambia.

    | Lugar | Hoy | Pasa a | Tarea |
    |---|---|---|---|
    | `EventCard.tsx:80` | `/events/${event.id}` | `/events/${event.slug}` | T4 |
    | `FeaturedEventsCarousel.tsx` (CTA que se restauran) | — | `/events/${current.slug}/tickets` y `/events/${current.slug}` | T4 |
    | `EventDetailHero.tsx:68` | `/events/${event.id}/tickets` | `/events/${event.slug}/tickets` | T3 |
    | `PurchaseCard.tsx:27` | `/events/${event.id}/tickets` | `/events/${event.slug}/tickets` | T3 |
    | `TicketSelection.tsx:52` | `/events/${event.id}` | `/events/${event.slug}` | T3 |
    | `TicketSelection.tsx:88` | `/events/${event.id}/checkout` | `/events/${event.slug}/checkout` | T3 |
    | `CheckoutSummary.tsx:60` | `/events/${event.id}/tickets` | `/events/${event.slug}/tickets` | T3 |
    | `CheckoutForm.tsx:97` (`EmptyState`) | `/events/${eventId}/tickets` | La prop `eventId` de `EmptyState` pasa a `eventSlug` → `/events/${eventSlug}/tickets`. Los dos usos (líneas 142 y 151) le pasan `event.slug` | T3 |
    | `CheckoutForm.tsx:198` (`router.push`) | `/events/${event.id}/confirmation` | `/events/${event.slug}/confirmation` | T3 |
    | `tickets/page.tsx:21` (`backHref`) | `/events/${id}` | `/events/${event.slug}` | T5 |
    | `checkout/page.tsx:18` (`backHref`) | `/events/${id}/tickets` | `/events/${event.slug}/tickets` | T5 |

    Tipos de props, para que solo pidan lo que usan:
    - `PurchaseCardProps["event"]` pasa a `Pick<Event, "slug" | "priceFrom" | "currency" | "status">`: `id` solo se usaba en el href.
    - `TicketSelectionProps["event"]` agrega `"slug"` y conserva `"id"`, que es el del store.
    - `CheckoutEvent` (`CheckoutSummary.tsx:8`) agrega `"slug"` y conserva `"id"`, porque `CheckoutForm` lo usa en `isCurrent`.

    No cambian:
    - `/organizer/events/${id}/edit` (`OrganizerEventRow.tsx:254`, `EventForm.tsx:245`): es otra ruta y sigue con `id`;
    - `OrderConfirmation`, `MyTickets`, `TicketDetailCard` y `CheckoutHeader`.
  - **Rutas.** Las 4 páginas solo componen: ya no importan `event-service.ts` ni `venue-service.ts`.
    - Se eliminan los 4 archivos de `src/app/(platform)/events/[id]/` y se crean los 4 de `src/app/(platform)/events/[slug]/`. El `params` es `{ slug: string }`.
    - `/events/[slug]` (`PageProps<"/events/[slug]">`):
      - `generateMetadata` usa `getPublicEventDetail(slug)`. Devuelve `title: "<título> — Ticketera"` y `description` solo si no está vacía; si no hay evento, `{}`.
      - Página: `Promise.all([getPublicEventDetail(slug), listPublicCategories()])` → `notFound()` si no hay evento → `Promise.all([getEventVenueMap(event), listRelatedEvents(event.id)])`.
      - El breadcrumb sigue resolviendo el slug de la categoría con `listPublicCategories()`.
      - La sección "Acerca del evento" solo se renderiza si `description` no está vacía. El resto del layout no cambia.
    - `/events/[slug]/tickets` (`PageProps<"/events/[slug]/tickets">`):
      - `generateMetadata` y página con `getPublicEventDetail` → `notFound()` → `getEventVenueMap(event)` → `TicketSelection`;
      - `backHref` = `/events/${event.slug}`.
    - `/events/[slug]/checkout` (`PageProps<"/events/[slug]/checkout">`): igual que `/tickets`, pasa `venue.zones` a `CheckoutForm` y usa `backHref` = `/events/${event.slug}/tickets`.
    - `/events/[slug]/confirmation` (`PageProps<"/events/[slug]/confirmation">`): `getPublicEventDetail` → `notFound()` → `OrderConfirmation`.
    - No se agrega `generateStaticParams`, `dynamic` ni `revalidate`. Las rutas se renderizan en cada request, así que el build no toca la DB y la disponibilidad está al día.
    - **Tipos tras el renombre.** `PageProps` es global y se genera, y hoy `.next/types/validator.ts` importa las 4 páginas `[id]`. Sin regenerar, `tsc` falla. Pasos:
      - verificar con `npx next typegen && npx tsc --noEmit`;
      - `next typegen` reescribe `.next/types/`, pero `tsconfig.json` también incluye `.next/dev/types/**/*.ts`. Si ese directorio quedó de un `next dev` anterior al renombre, hay que regenerarlo arrancando `next dev` o borrarlo (`.next/` está en `.gitignore`).
  - **Portadas robustas.** Con datos reales, la portada puede faltar (`""`) o venir de cualquier host `https`, y `next.config.ts` solo permite `images.unsplash.com`. Hoy `EventDetailHero.tsx:29`, `TicketSelection.tsx:61`, `CheckoutSummary.tsx:26` y `TicketPass.tsx:41` renderizan `<Image src={event.imageUrl}>` sin `unoptimized` y sin placeholder, y fallarían.
    - Componente nuevo `EventCover` en `src/modules/event/components/EventCover.tsx`, con props `{ src: string; alt: string; sizes: string; priority?: boolean; className?: string }`:
      - si `src === ""`, un placeholder `aria-hidden` con `ImageIcon` que ocupa el contenedor (colores por defecto `bg-zinc-200 text-zinc-400`, ajustables con `className`);
      - si hay `src`, `<Image fill unoptimized className="object-cover">`.
      - Se usa dentro de un contenedor `relative`, como ya lo son los 4 lugares.
    - Lo usan `EventDetailHero` (con `alt = imageAlt` y `priority`), `TicketSelection`, `CheckoutEventHeader` de `CheckoutSummary` y `TicketPass` (los tres con `alt=""`).
    - Shadcn no tiene un equivalente: `npx shadcn@latest search @shadcn -q image` solo devuelve bloques de login. `next.config.ts` no cambia.
  - **Datos opcionales en la UI**: `EventInfoGrid` muestra "Por confirmar" cuando `doorsOpenAt === ""`. `minAge` nulo sigue mostrando "Todas las edades".
  - **Re-enlace de la landing** (revierte la Pregunta 1 = C de `landing-real-data-featured.md`):
    - `src/app/page.tsx` quita `linked={false}`.
    - `EventGrid` elimina la prop `linked`, que queda sin usuarios (YAGNI), y vuelve a `<EventCard key event />`.
    - `EventCard`:
      - el href pasa a `/events/${event.slug}`;
      - el JSDoc de `preview` vuelve a decir que es solo la vista previa de crear evento.
    - `FeaturedEventsCarousel` restaura, bajo el precio "Desde", los CTA de `b457c22`, ahora con slug:
      - "Comprar entradas" (`variant: "cta"` + `ArrowRight`) → `/events/${current.slug}/tickets`;
      - "Ver detalles" (`variant: "outline"`, oculto bajo `sm`) → `/events/${current.slug}`.
      - **Nuevo**: si `current.status === "sold-out"` no se muestra "Comprar entradas", y "Ver detalles" se ve en todos los anchos (`flex-1`). El badge "Agotado" ya está sobre la foto.
- No incluye:
  - **Búsqueda `/events`** (tarea 04): sigue en el mock. Lo único que cambia es el `slug` literal de `EVENTS`, así que sus tarjetas enlazan a `/events/<slug>` (ver Pregunta 8).
  - **Mis entradas `/my-tickets`** (tarea 09): sigue en el mock, con `MOCK_ORDERS` → `evt-001`/`evt-004`.
    - Los pedidos simulados de eventos reales no aparecen ahí, porque `splitOrdersByDate` descarta ids desconocidos (no hay crash).
    - `MyTickets.tsx` solo enlaza a `/events`, no al detalle; ni él ni `TicketDetailCard.tsx` cambian.
  - **Reservas y escrituras** (tarea 05): `reservation`, `held_count`, `event_seat.status = 'held'`, pago real, `max_per_order` y el tope GA por disponibilidad restante.
  - **Cambios en los services mock más allá del `slug`**:
    - en `src/modules/event/services/event-service.ts` solo se permite agregar `slug` a los 10 literales de `EVENTS`, con los valores de la tabla. No cambian `EVENT_DETAILS`, las funciones ni sus firmas;
    - no se editan ni se borran `event-service.test.ts`, `src/modules/booking/services/venue-service.ts`, `venue-service.test.ts`, `src/modules/booking/services/order-service.ts`, `order-service.test.ts` ni `src/db/seed-data.ts`.
  - Cambios en `src/db/schema/*`, migraciones, `next.config.ts` o `docs/architecture/*`.
  - Redirigir desde URLs por UUID, regenerar el slug al editar el título o normalizar mayúsculas y acentos en la URL (ver "Definiciones").
  - Pasar `EventCard`/`FeaturedEventsCarousel` a `EventCover` (ya manejan el placeholder; ver "Próximas fases").

## Reutilizar

- `src/modules/event/services/event-public-service.ts`: `isPublic(now)`, `selectPublicZones`, `selectPublicEvents` y `listPublicCategories` (breadcrumb). Se extiende ese archivo.
- `src/modules/event/event-public.utils.ts`: `toPublicEvents` (base del detalle), `availabilityStatus` (estado por zona), `LAST_TICKETS_RATIO`, `PublicEventRow` y `PublicZoneRow`.
- `src/modules/event/services/event-facts-service.ts`: fragmentos `zoneCapacity` y `zoneOccupancy`, y el orden de `selectZoneStates`. Se reutilizan los fragmentos y no `getZoneStates`, porque `ZoneState` no trae nombre, color ni forma.
- `src/modules/event/event-list.utils.ts`: `toLimaDate` y `toLimaTime`.
- `slugify` (`src/lib/utils.ts`) y `nextAvailableSlug` (`src/modules/event/event-write.utils.ts`): definen el formato que valida `isEventSlug` y dan los literales del mock. No se modifican.
- Índice único de `event.slug` (`src/db/schema/event.ts:20`) para la búsqueda por slug.
- Tipos: `VenueMap`/`Zone`/`Seat`/`ZoneShape`/`SeatStatus` y `Order` de `booking.types.ts`, sin cambios. `Event` solo gana `slug`.
- Componentes que no cambian y consumen el nuevo origen tal cual: `TicketTierList`, `VenueCard`, `EventStatusBadge`, `VenueExplorer`, `VenueOverview`, `SeatMap`, `ZoneLegend`, `GeneralAdmissionPanel`, `OrderSummary`, `OrderConfirmation`, `CheckoutHeader`, `booking.store` y `seat-navigation`. `PurchaseCard`, `TicketSelection`, `CheckoutSummary` y `CheckoutForm` sí cambian, pero solo en href, `Pick` y portada.
- UI: `Button`/`buttonVariants` (`src/components/ui/button.tsx`) y `lucide-react` (`ImageIcon`, `ArrowRight`). No hace falta `npx shadcn add`, así que no hay T0.

## Archivos

| Archivo | Cambio | Tarea |
|---|---|---|
| `src/modules/event/event.types.ts` | + `Event.slug`; JSDoc de `EventDetail.doorsOpenAt` (`""` = sin hora) | T1 |
| `src/modules/event/event-public.utils.ts` | + `slug` en `PublicEventRow` y en `toPublicEvents`; + `PublicEventDetailRow`, `toPublicEventDetail`, `EVENT_SLUG_PATTERN`, `isEventSlug`, `RELATED_LIMIT` | T1 |
| `src/modules/event/event-public.utils.test.ts` | fixture y `toEqual` con `slug`; + casos de detalle y guarda | T1 |
| `src/modules/event/services/event-public-service.ts` | `slug` en `selectPublicEvents`; + `getPublicEventDetail(slug)`, `listRelatedEvents(eventId)` | T1 |
| `src/modules/event/services/event-service.ts` | mock: solo `slug` en los 10 literales de `EVENTS` | T1 |
| `src/modules/event/event-search.test.ts` | solo `slug` en la base del factory `event()` | T1 |
| `src/modules/organizer/components/EventForm.tsx` | solo `slug: "preview"` en `previewEvent` | T1 |
| `src/modules/booking/venue-map.utils.ts` | nuevo: `toVenueMap`, `shortZoneName`, `VENUE_VIEWBOX`, `VENUE_STAGE`, `DEFAULT_ZONE_COLOR`, `EMPTY_ZONE_SHAPE` y los tipos de fila | T2 |
| `src/modules/booking/venue-map.utils.test.ts` | nuevo | T2 |
| `src/modules/booking/services/venue-map-service.ts` | nuevo: `getEventVenueMap` | T2 |
| `src/modules/event/components/EventCover.tsx` | nuevo | T3 |
| `src/modules/event/components/EventDetailHero.tsx` | usa `EventCover`; href por slug | T3 |
| `src/modules/event/components/EventInfoGrid.tsx` | "Por confirmar" si `doorsOpenAt === ""` | T3 |
| `src/modules/event/components/PurchaseCard.tsx` | `Pick` con `slug` en vez de `id`; href por slug | T3 |
| `src/modules/booking/components/TicketSelection.tsx` | usa `EventCover`; `Pick` + `slug`; 2 href por slug | T3 |
| `src/modules/booking/components/CheckoutSummary.tsx` | usa `EventCover` en `CheckoutEventHeader`; `CheckoutEvent` + `slug`; href por slug | T3 |
| `src/modules/booking/components/TicketPass.tsx` | usa `EventCover` | T3 |
| `src/modules/booking/components/CheckoutForm.tsx` | `EmptyState` con `eventSlug`; `router.push` por slug | T3 |
| `src/app/page.tsx` | quita `linked={false}` | T4 |
| `src/modules/event/components/EventGrid.tsx` | elimina la prop `linked` | T4 |
| `src/modules/event/components/EventCard.tsx` | href por slug; JSDoc de `preview` | T4 |
| `src/modules/event/components/FeaturedEventsCarousel.tsx` | restaura los CTA por slug (con la rama `sold-out`) | T4 |
| `src/app/(platform)/events/[id]/page.tsx` | se elimina | T5 |
| `src/app/(platform)/events/[id]/tickets/page.tsx` | se elimina | T5 |
| `src/app/(platform)/events/[id]/checkout/page.tsx` | se elimina | T5 |
| `src/app/(platform)/events/[id]/confirmation/page.tsx` | se elimina | T5 |
| `src/app/(platform)/events/[slug]/page.tsx` | nuevo: detalle desde la DB | T5 |
| `src/app/(platform)/events/[slug]/tickets/page.tsx` | nuevo: selección desde la DB | T5 |
| `src/app/(platform)/events/[slug]/checkout/page.tsx` | nuevo: checkout desde la DB | T5 |
| `src/app/(platform)/events/[slug]/confirmation/page.tsx` | nuevo: confirmación desde la DB | T5 |

## Criterios de aceptación

- AC1: `/events/<slug>` de un evento visible en público muestra, leído de la DB:
  - título, categoría y portada;
  - fecha (día de Lima), hora de inicio y de apertura (`HH:mm` de Lima) y edad mínima;
  - descripción;
  - recinto (nombre, dirección y ciudad);
  - precio "desde".

  El precio y el estado (badge, CTA "Agotado") coinciden con la tarjeta del mismo evento en la landing.
- AC2: `TicketTierList` y `PurchaseCard` listan las `event_zone` del evento en el orden de `venue_zone.sort_order`. El precio es `price_cents / 100` y el estado de cada zona sigue "Definiciones" (`available` / `last-tickets` / `sold-out`).
- AC3: Las 4 rutas (`/events/[slug]`, `/tickets`, `/checkout` y `/confirmation`) responden 404 vía `notFound()`, nunca 500, en estos casos:
  - **Formato inválido** (p. ej. `/events/Bad-Bunny`, `/events/a--b`, `/events/clásico`, `/events/x-/tickets`): `getPublicEventDetail` devuelve `undefined` sin tocar la DB. El caso `\u0000` se cubre con el test unitario de `isEventSlug`, no con una URL manual, porque depende de cómo Next decodifique `%00` antes de llegar a la página.
  - **Formato válido pero inexistente** (p. ej. `/events/evt-001` o un UUID en minúsculas): una sola consulta por `slug`, sin fila.
  - Eventos `draft`, `cancelled` o `finished`.
  - Eventos `published` con `starts_at <= now`.

  Las consultas que no dependen del slug, como `listPublicCategories()`, pueden ejecutarse igual.
- AC4: En el breadcrumb del detalle, la categoría enlaza a `/?categoria=<slug de la categoría>#eventos`, con el slug real de la DB.
- AC5: "También te puede interesar" muestra hasta 4 eventos visibles en público de la misma categoría, sin el actual, por `starts_at` ascendente. Si no hay ninguno, la sección no se renderiza. Cada tarjeta enlaza a `/events/<slug>`.
- AC6: `/events/<slug>/tickets` dibuja las zonas con el `map_shape` y el `color` de `venue_zone`.
  - Las zonas numeradas muestran sus asientos en `x`/`y`.
  - Un asiento con `event_seat.status` distinto de `available` se ve ocupado y no se puede seleccionar. Una zona `sold-out` no se puede elegir.
  - Las zonas GA se compran por cantidad.
  - "Volver al evento" → `/events/<slug>` y el resumen lleva a `/events/<slug>/checkout`.
- AC7: `/events/<slug>/checkout` muestra la selección del store con las zonas y precios reales.
  - "Volver a entradas" y el "Elegir entradas" del estado vacío llevan a `/events/<slug>/tickets`.
  - El pago simulado lleva a `/events/<slug>/confirmation`, que muestra el pedido del store con los datos del evento leídos de la DB.
  - El store sigue indexado por `event.id`: la selección hecha en `/tickets` aparece en `/checkout`, y el pedido en `/confirmation`.
  - No se escribe nada en la DB: ni `reservation` ni `orders`, ni `held_count`/`sold_count`, ni `event_seat.status`.
- AC8: Landing:
  - las tarjetas de "Próximos eventos" enlazan a `/events/<slug>`;
  - el carousel muestra "Comprar entradas" → `/events/<slug>/tickets` y "Ver detalles" → `/events/<slug>` (desde `sm`);
  - si el evento activo está `sold-out`, no aparece "Comprar entradas" y "Ver detalles" se ve en todos los anchos;
  - `EventGrid` ya no tiene la prop `linked`.
- AC9: Un evento con `cover_image_url` nulo, o de un host que no está en `next.config.ts`, renderiza las 4 rutas sin error: placeholder con ícono si no hay portada, `next/image` con `unoptimized` si la hay. `next.config.ts` no cambia.
- AC10: Datos opcionales:
  - sin `doors_open_at`, "Apertura de puertas" muestra "Por confirmar";
  - con `description` nula o vacía no se renderiza "Acerca del evento" y la metadata no lleva `description`;
  - con `min_age` nulo se muestra "Todas las edades".
- AC11: El mock sigue compilando y funcionando:
  - en `event-service.ts` lo único que cambia es el `slug` de los 10 literales de `EVENTS`, con los valores de la tabla de "Alcance" (= `slugify(title)`);
  - `event-service.test.ts`, `venue-service.ts`, `order-service.ts`, sus tests y `seed-data.ts` no cambian;
  - `/events`, `/my-tickets` y `buildSeedData` siguen funcionando, y las tarjetas de `/events` enlazan a `/events/<slug>`;
  - `booking.types.ts`, `booking.store.ts`, `MyTickets.tsx` y `OrderConfirmation.tsx` no cambian;
  - `Event` solo gana `slug` y `EventDetail` no gana ningún otro campo.
- AC12: Ninguna de las 4 páginas exporta `generateStaticParams`, `dynamic` ni `revalidate`. `npm run build` no consulta la DB.
- AC13: Calidad y verificación:
  - los services nuevos o extendidos no importan `next/*`;
  - las páginas no contienen mapeo ni reglas de negocio, y el mapeo vive en `*.utils.ts` con tests;
  - `npx next typegen && npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan en verde.
- AC14: No queda ningún enlace público por `id`:
  - `grep -rn '/events/\${' src` → todo match de la ruta pública `/events/…` interpola un slug (`event.slug`, `current.slug` o `eventSlug`), nunca un `id`. Quedan fuera los de `/organizer/events/…`, que siguen con `id`;
  - no existe `src/app/(platform)/events/[id]/` ni ningún literal `PageProps<"/events/[id]…">`.

## Tests requeridos

(Vitest, junto al archivo)

- `src/modules/event/event-public.utils.test.ts` (se extiende):
  - el fixture `row()` agrega `slug`, y el `toEqual` completo de `toPublicEvents` lo incluye: `toPublicEvents` propaga `slug`.
  - `toPublicEventDetail`:
    - propaga `slug`;
    - los campos base salen igual que en `toPublicEvents`: `priceFrom` mínimo, `status`, `imageUrl` `""` e `imageAlt = title` cuando faltan portada y alt;
    - `startsAt` y `doorsOpenAt` en `HH:mm` de Lima, incluido un instante que en UTC cae al día siguiente (`date` = día de Lima) y la medianoche → `"00:00"`;
    - `doorsOpenAt` nulo → `""`;
    - `description` nula → `""`;
    - `address`;
    - `minAge` nulo se conserva;
    - sin zonas → `sold-out` con `priceFrom` 0.
  - `isEventSlug`:
    - `true`:
      - `"bad-bunny-world-tour"`;
      - `"bad-bunny-world-tour-2"` (sufijo de `nextAvailableSlug`);
      - `"event"` (fallback de base vacía);
      - `"2026"`;
      - un UUID en minúsculas (`"550e8400-e29b-41d4-a716-446655440000"`). Queda documentado que pasa la guarda: decide la DB, que da 404.
    - `false`: `""`, `"Bad-Bunny"`, `"-x"`, `"x-"`, `"a--b"`, `"bad bunny"`, `"clásico"`, `"a/b"`, `"a\u0000b"` y un UUID en mayúsculas.
    - Consistencia con los generadores:
      - `isEventSlug(slugify(title))` es `true` para títulos no vacíos con acentos y signos (p. ej. `"Clásico Peruano: Universitario vs. Alianza Lima"`);
      - `isEventSlug(nextAvailableSlug("bad-bunny", ["bad-bunny"]))` es `true`.
- `src/modules/booking/venue-map.utils.test.ts` (nuevo):
  - `toVenueMap`:
    - `eventId`, `viewBox` y `stage` constantes;
    - conserva el orden de zonas de la entrada;
    - `kind` según `seating_type`;
    - `price` de céntimos a unidades;
    - `currency` del evento;
    - `color` nulo → `DEFAULT_ZONE_COLOR`;
    - `status`: `available`, `last-tickets` y `sold-out`, y capacidad 0 → `sold-out`;
    - `shape` válido se conserva; nulo o mal formado (p. ej. `{ path: 1 }`) → `EMPTY_ZONE_SHAPE`;
    - los asientos van solo a zonas `seated`, cada uno en su zona por `eventZoneId`;
    - GA sin `rows`; `seated` sin asientos → `rows: []`;
    - filas en orden natural (`"A"` < `"B"`, `"2"` < `"10"`) y asientos por número;
    - `x`/`y` nulos → 0;
    - `available` → `"available"`; `held`, `sold` y `blocked` → `"occupied"`.
  - `shortZoneName`: `"Tribuna Occidente"` → `"Occidente"`, `"VIP"` → `"VIP"`, y tolera espacios extra.
- `event-search.test.ts` solo cambia la base del factory; sus casos no cambian y deben seguir en verde.
- `event-public-service.ts` y `venue-map-service.ts` no llevan tests unitarios. Es el patrón del repo: consultas finas y la lógica en utils, como ya pasa con `event-public.utils.test.ts`. Las páginas y los componentes visuales no requieren test.

## Tareas

### T1 — `slug` en `Event` y lectura pública del detalle
- Archivos: `src/modules/event/event.types.ts`, `src/modules/event/event-public.utils.ts`, `src/modules/event/event-public.utils.test.ts`, `src/modules/event/services/event-public-service.ts`, `src/modules/event/services/event-service.ts` (solo `slug` en `EVENTS`), `src/modules/event/event-search.test.ts` (solo la base del factory), `src/modules/organizer/components/EventForm.tsx` (solo `slug` en `previewEvent`)
- Depende de: —
- Paralelizable: sí (ola 1, con T2).
  - Con `slug: string` requerido, todos los productores de `Event` dejan de compilar a la vez: el mock, el factory del test, `previewEvent` y `toPublicEvents`. Por eso son de una sola tarea.
  - No cambia la firma de `availabilityStatus`, `summarizeZones` ni `toPublicEvents`, que T2 importa.
  - Al terminar T1, las páginas `[id]` actuales siguen compilando (el `EventDetail` del mock ya trae `slug`).
- Cubre: AC1 (datos), AC3 (guarda de slug), AC5 (datos), AC10 (datos), AC11, AC13

### T2 — Mapa del recinto desde la DB
- Archivos: `src/modules/booking/venue-map.utils.ts` (nuevo), `src/modules/booking/venue-map.utils.test.ts` (nuevo), `src/modules/booking/services/venue-map-service.ts` (nuevo)
- Depende de: — (solo importa lo que ya existe: `availabilityStatus`, `zoneCapacity`, `zoneOccupancy` y los tipos de `booking.types.ts`)
- Paralelizable: sí (ola 1, con T1)
- Cubre: AC2 (datos), AC6 (datos), AC13

### T3 — Portada, datos opcionales y enlaces por slug en el detalle y la compra
- Archivos: `src/modules/event/components/EventCover.tsx` (nuevo), `src/modules/event/components/EventDetailHero.tsx`, `src/modules/event/components/EventInfoGrid.tsx`, `src/modules/event/components/PurchaseCard.tsx`, `src/modules/booking/components/TicketSelection.tsx`, `src/modules/booking/components/CheckoutSummary.tsx`, `src/modules/booking/components/TicketPass.tsx`, `src/modules/booking/components/CheckoutForm.tsx`
- Depende de: T1 (`Event.slug`)
- Paralelizable: sí (ola 2, con T4 y T5).
  - `CheckoutSummary.tsx` y `CheckoutForm.tsx` van juntos porque `CheckoutForm` importa `CheckoutEvent`.
  - `isCurrent`/`init` siguen con `event.id`.
- Cubre: AC6 (enlaces), AC7 (enlaces), AC9, AC10 (apertura "Por confirmar"), AC14 (sus href)

### T4 — Re-enlace de la landing por slug
- Archivos: `src/app/page.tsx`, `src/modules/event/components/EventGrid.tsx`, `src/modules/event/components/EventCard.tsx`, `src/modules/event/components/FeaturedEventsCarousel.tsx`
- Depende de: T1 (`Event.slug`). `page.tsx` y `EventGrid.tsx` van juntos porque quitar `linked` debe compilar en un solo paso.
- Paralelizable: sí (ola 2, con T3 y T5)
- Cubre: AC5 (enlace de las tarjetas), AC8, AC14 (sus href)

### T5 — Rutas `[slug]` del detalle y de la compra con datos reales
- Archivos: `src/app/(platform)/events/[id]/page.tsx`, `src/app/(platform)/events/[id]/tickets/page.tsx`, `src/app/(platform)/events/[id]/checkout/page.tsx` y `src/app/(platform)/events/[id]/confirmation/page.tsx` (se eliminan); `src/app/(platform)/events/[slug]/page.tsx`, `src/app/(platform)/events/[slug]/tickets/page.tsx`, `src/app/(platform)/events/[slug]/checkout/page.tsx` y `src/app/(platform)/events/[slug]/confirmation/page.tsx` (nuevos)
- Depende de: T1, T2
- Paralelizable: sí (ola 2, con T3 y T4).
  - Compila sin T3 ni T4: el `EventDetail` que pasa a los componentes ya trae `slug` e `id`.
  - Tras el renombre hay que correr `npx next typegen` antes de `npx tsc --noEmit`, y regenerar o borrar `.next/dev/types/` si quedó de antes (ver "Alcance → Rutas").
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC10 (descripción y metadata), AC11, AC12, AC13, AC14 (carpeta y `PageProps`)

Olas:
- **Ola 1** = T1 y T2 en paralelo (archivos disjuntos).
- **Ola 2** = T3, T4 y T5 en paralelo (archivos disjuntos). Los enlaces quedan coherentes de punta a punta recién cuando la ola 2 está integrada completa.

## Preguntas abiertas

> Resueltas por el humano (2026-10-05): Pregunta 2 = slug. Preguntas 1 y 3–9: se aceptan los valores por defecto.

1. **Alcance del flujo de compra.** Resuelta = **A**: se pasan a la DB las lecturas de `/tickets`, `/checkout` y `/confirmation`, sin escrituras (D1).
2. **URL por `id` o por `slug`.** Resuelta = **`slug`** (D2).
   - `/events/[slug]`, con `Event.slug` como clave de URL, y el `id` como identidad interna del store, los pedidos, el mapa y la reserva.
   - Se renombra `[id]` → `[slug]`, se agrega `slug` a `Event` y a sus productores (en el mock, el literal `slugify(title)`) y todos los href públicos pasan al slug.
3. **Eventos no visibles al público.** Resuelta = 404 para todo lo que no sea `published` con `starts_at > now`, incluidos `cancelled`, `finished` y publicados que ya empezaron (D3).
   - La vista con aviso ("Evento cancelado" / "Evento finalizado") queda para una fase posterior. Hará falta cuando "Mis entradas" (tarea 09) enlace a eventos pasados.
4. **Layout del recinto fuera de la DB.** Resuelta = constantes del estadio del seed para `viewBox` y `stage`, y la última palabra del nombre para `shortName`. Las columnas por recinto (`venue.map_view_box`/`venue.stage`, `venue_zone.short_name`) requieren migración y quedan para "Próximas fases".
5. **Zonas sin `map_shape` válido.** Resuelta = la zona sigue listada (`TicketTierList`, `ZoneLegend`) con `EMPTY_ZONE_SHAPE`, así que no se dibuja en la vista general.
6. **Relacionados.** Resuelta = solo de la misma categoría; si no hay, la sección se oculta. No se rellena con otras categorías.
7. **Asientos `blocked`.** Resuelta = se ven ocupados, pero no suman a la ocupación de la zona (`zoneOccupancy` = `sold` + `held`, igual que en la landing).
8. **Efectos colaterales hasta otras tareas.** Resuelta = se aceptan, con este efecto actualizado por la decisión del slug:
   - **Búsqueda mock `/events`.** Sus tarjetas enlazan a `/events/<slug>`, y el `slug` literal del mock es el mismo que siembra `seed-data.ts:131` (`slugify(title)`). `seed.ts` inserta esos eventos como `published`, con fechas futuras.
     - Con la DB sembrada, cada tarjeta abre el detalle real del evento sembrado; ya no hay un 404 sistemático.
     - Solo da 404 limpio si ese evento ya no es visible (cancelado, empezado) o si la DB no está sembrada.
     - Hasta la tarea 04, el precio y el estado de la tarjeta mock pueden no coincidir con los del detalle real.
   - **`/my-tickets`.** Los pedidos simulados de eventos reales no aparecen ahí hasta la tarea 09; se descartan sin error.
9. **Límite por pedido.** Resuelta = no se cambia aquí.
   - Hoy `event_zone.max_per_order` (default 10 en la DB) no coincide con `MAX_TICKETS_PER_ZONE = 6` del store, y en GA la cantidad seleccionable no se limita por lo que queda disponible.
   - Se resuelve en la tarea 05, donde la reserva valida el inventario.

Preguntas nuevas: ninguna. Las tres decisiones que abre el slug se resuelven con un default sin costo y quedan en "Definiciones":
- sin redirección desde UUID, porque nunca hubo URLs públicas por UUID;
- el slug no cambia al editar el título;
- mayúsculas o acentos en la URL dan 404, sin normalizar.

## Próximas fases

- Tarea 04: búsqueda `/events` con la DB. Las tarjetas dejan de mostrar datos del mock.
- Tarea 05: reservas y escrituras (`reservation`, `held_count`, `event_seat.status = 'held'`), `max_per_order` y tope GA por disponibilidad restante.
- Tarea 09: "Mis entradas" con la DB, incluido `EventCover` en `MyTickets`/`TicketDetailCard`.
- Retirar los services mock cuando las tareas 04 y 09 estén hechas y `seed-data.ts` deje de depender de ellos.
- Vista de detalle para eventos `cancelled`/`finished` con aviso (Pregunta 3).
- Columnas de layout por recinto: `viewBox`, `stage` y `short_name` (Pregunta 4).
- DRY: `EventCard` y `FeaturedEventsCarousel` sobre `EventCover`.
