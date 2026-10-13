# Landing con datos reales y eventos destacados

Estado: aprobada

## Objetivo

La landing (`src/app/page.tsx`) lee hoy el mock de `event-service.ts` (`getFeaturedEvents`, `getUpcomingEvents`, `getCategories`). Esta spec hace dos cosas:

1. El Hero (carousel), las categorías y "Próximos eventos" pasan a leer de la DB.
2. En el panel `/organizer` el admin puede marcar y desmarcar eventos como **destacados**, desde el listado y desde `/organizer/events/[id]/edit`. Los destacados forman el carousel del Hero.

**No hace falta migración.** La suposición inicial era que había que agregar una columna, pero `event.featured` ya existe: `boolean("featured").notNull().default(false)` en `src/db/schema/event.ts:48` y `"featured" boolean DEFAULT false NOT NULL` en `drizzle/0000_breezy_war_machine.sql:40`, y el seed ya lo escribe (`src/db/seed.ts:135`). Esta spec no toca `src/db/schema/*` ni `drizzle/*`. Solo justificaría una migración pedir un orden manual del carousel (`featured_order`/`featured_at`) o un orden curado de categorías (`sort_order`). Las dos opciones quedan en "Preguntas abiertas", no como tareas.

Referencias:
- `erd.md §3 (Evento)`: tabla `event` con `featured`; "Agotado y Últimas entradas se derivan de disponibilidad, no se almacenan" (línea 84).
- `system-design.md §3`: "Roles y autorización" (moderar eventos es de `admin`) y "Reglas de límite" (la action valida y autoriza el rol grueso; el service decide; los services no importan `next/*`). Permiso `event:moderate` en `src/modules/user/user.permissions.ts`.
- Specs aprobadas en las que se apoya: `event-crud.md` (policy pura, patrón `run()` de actions, definición de **ocupación** = GA `sold_count + held_count`, numerada = `event_seat` en `sold`/`held`; el admin usa `/organizer`) y `organizer-dashboard-real-data.md` (`listManagedEvents`, `useEvents`, clave `["events"]`).
- Next 16:
  - `node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md`: `searchParams` es dato de runtime, así que `/` se renderiza por request.
  - `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md`: en Server Functions actualiza la UI al instante.
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md` (`unoptimized`, `remotePatterns`).

### Definiciones

- **Visible en público**: `event.status = 'published'` y `event.starts_at > now`. El filtro va en SQL y lo cubre el índice `event_status_starts_at_idx`.
- **En el Hero**: visible en público y `featured = true`. Por eso no hace falta quitar el destacado al cancelar o despublicar un evento: deja de verse solo (KISS).
- **Ocupación de una zona**: la misma de `event-crud.md` (fragmento `zoneOccupancy` de `event-facts-service.ts`). **Capacidad de una zona**: GA = `coalesce(event_zone.capacity, 0)`; numerada = nº de `event_seat` de la zona.
- **Disponibilidad del evento**: `restante = Σcapacidad − Σocupación`.
  - `sold-out` si `Σcapacidad <= 0` o `restante <= 0`.
  - `last-tickets` si `restante <= Σcapacidad × LAST_TICKETS_RATIO` (`0.1`).
  - `available` en el resto de casos.

## Alcance

- Incluye:
  - **Lectura pública desde la DB**, en un archivo nuevo `services/event-public-service.ts`. Así el mock queda intacto para las rutas que lo siguen usando:
    - `listPublicCategories()`: todas las categorías ordenadas por `label`.
    - `listFeaturedEvents(now?)`: eventos en el Hero, por `starts_at` ascendente y luego `id`, hasta `FEATURED_LIMIT` (5).
    - `listUpcomingEvents(categorySlug?, now?)`: eventos visibles en público, por `starts_at` ascendente, hasta `UPCOMING_LIMIT` (8). El límite que hoy hace el `.slice(0, 8)` de `page.tsx` pasa al service.
    - Por evento se leen una vez las filas por zona (precio, capacidad, ocupación) con una consulta `inArray(eventZone.eventId, ids)` que hace join con `venue_zone`, igual que `selectZoneStates`.
    - "Próximos eventos" incluye también los destacados, como hoy.
  - **Mapeo puro DB → `Event`** en `event-public.utils.ts`:
    - `priceFrom` = mínimo `price_cents` / 100.
    - `status` según "Disponibilidad".
    - `date` = `toLimaDate(starts_at)`.
    - `category` = `category.label`; `venue`/`city` desde `venue`; `currency` y `featured` del evento.
    - `imageUrl` = `cover_image_url ?? ""`, donde `""` significa "sin portada" (convención que `EventCard` ya respeta).
    - `imageAlt` = `cover_alt ?? title`.
    - Un evento sin zonas (no debería pasar si está publicado) queda como `sold-out` con `priceFrom` 0.
  - **Identidad de categorías**: el `EventCategory.id` público es el **`slug`** de la DB, así que la URL queda `?categoria=conciertos`. `CategoryCard`/`CategoryChips` no cambian de forma. `icon` nulo pasa a `""`, y `CategoryCard` ya cae en `bg-muted` sin ícono.
    - Para que el breadcrumb del detalle (mock, `events/[id]/page.tsx:55`) siga filtrando bien, los ids de `CATEGORIES` del mock se alinean con los slugs (`cat-conciertos` → `conciertos`, …). Ya coinciden con lo que el seed deriva (`seed-data.ts:92` quitaba el prefijo `cat-`; pasa a `slug: id`).
    - Efecto colateral: `/events` también usa `?categoria=conciertos` (ver Preguntas abiertas).
  - **DRY de capacidad**: el `case` de capacidad por zona que hoy está inline en `selectZoneSales` (`event-list-service.ts:41-50`) se exporta como `zoneCapacity` desde `event-facts-service.ts`, junto a `zoneOccupancy`. `selectZoneSales` pasa a usarlo sin cambiar su comportamiento. No se reutiliza `aggregateZoneSales` porque suma solo lo vendido (sin `held`) y alimenta los ingresos del admin; la lectura pública necesita mínimo de precio y ocupación, así que lleva su propio agregador puro.
  - **Imágenes**: todas las `next/image` de portadas públicas (`EventCard`, imagen principal y miniaturas del carousel) usan `unoptimized`, igual que la decisión de `event-crud.md` para `CoverImageInput`/`OrganizerEventRow`. El organizador puede ingresar cualquier host `https` y `next.config.ts` solo permite `images.unsplash.com`. No se toca `next.config.ts`: abrir `remotePatterns` a `**` convertiría el optimizador en un proxy abierto. Placeholder cuando `imageUrl === ""`: `EventCard` ya lo tiene; el carousel gana uno (panel `bg-indigo-900` con `ImageIcon`, y un cuadro `bg-muted` con `ImageIcon` en la miniatura).
  - **Landing sin enlaces a detalle (Pregunta 1 = C)**: mientras el detalle siga en mock, la landing no enlaza a `/events/<uuid>` ni a `/events/<uuid>/tickets`.
    - `FeaturedEventsCarousel` (solo lo usa `Hero`, solo en la landing) elimina los dos CTA ("Comprar entradas" y "Ver detalles"); se mantiene el precio "Desde".
    - `EventGrid` acepta `linked?: boolean` (default `true`) y renderiza `<EventCard preview={!linked}>`. `src/app/page.tsx` pasa `linked={false}`. `/events` y los relacionados del detalle (mock) siguen enlazando como hoy.
    - Con `unoptimized` siempre activo, el único efecto de `EventCard.preview` es no enlazar; su comentario lo dice así. No se renombra la prop (la usa `EventForm`, de T5).
  - **Hero sin destacados**: se oculta el carousel y quedan el titular y el buscador. `Hero` no renderiza el contenedor `mt-6` si `events` está vacío. No se rellena con "próximos" porque el carousel dice "Destacado".
  - **Toggle de destacado (solo admin)**:
    - Policy pura `canFeatureEvent(actor, event, now)` = `can(actor.role, "event:moderate") && !isEventReadOnly(event, now)`: admin y super_admin, sobre eventos `draft` o `published` no empezados.
    - `EventCapabilities.feature` se calcula en `getEventCapabilities`. Llega solo a la fila del listado y a `EventForEdit`, que ya trae `capabilities`, así que no hace falta un `canFeature` aparte.
    - `ManagedEventRow.featured` y `EventForEdit.featured`.
  - **Escritura por una vía separada del formulario**:
    - `featured` **no** entra en `event-write.schema.ts` ni en `updateEvent`, así que un organizador no puede marcarlo desde el formulario.
    - `setEventFeatured(actor, id, featured)` en `event-write-service.ts`:
      1. `loadVisibleEvent`; si no existe o no se puede ver, "No encontramos el evento.".
      2. Si es solo lectura, `MESSAGES.readOnly`; si `!canFeatureEvent`, `MESSAGES.forbidden`.
      3. `UPDATE event SET featured = ? WHERE id = ?`; si afecta 0 filas, `notFound`.
    - No lleva guarda extra en el `WHERE`. Si el evento se cancela en medio, el flag queda en un evento que el Hero igual filtra (`updated_at` lo pone `$onUpdate`).
    - `setEventFeaturedAction({ id, featured })` en `actions.ts`, con el patrón existente: schema zod inline `eventIdSchema.extend({ featured: z.boolean() })` como `setStatusSchema`, `run()` con `requireRole("organizer")` como gate grueso y resultado `{ ok, error }`. El service decide si el actor es admin.
    - **`run()` revalida `"/"` además de `"/organizer"`** en todo éxito: publicar, despublicar, cancelar, editar y eliminar ahora también cambian la landing.
    - Hook `useSetEventFeatured()` en `use-event-mutations.ts`, que invalida `["events"]` y hace `router.refresh()` vía `useEventMutation`.
  - **UI del toggle**: un solo componente `FeaturedToggle` (DRY) que se usa en dos lugares:
    - En la celda del evento de `OrganizerEventRow`: botón ícono estrella `size-11`, sin tocar `EVENT_TABLE_COLUMNS` ni la cabecera de `OrganizerDashboard`. La columna de acciones (340 px) ya lleva hasta 4 botones.
    - En el encabezado de `EventForm` en modo edición, con texto visible y fuera del `<form>`.
    - Detalles en "Contratos".
- No incluye:
  - **Detalle, compra y búsqueda desde la DB.** `/events`, `/events/[id]`, `/tickets`, `/checkout`, `/confirmation` y `/my-tickets` siguen en el mock. Por eso la landing no enlaza a ellas (Pregunta 1 = C); los enlaces vuelven con la spec de detalle.
  - Borrar `getUpcomingEvents` o `getCategories` del mock: los siguen usando `src/app/(platform)/events/page.tsx`, `src/app/(platform)/my-tickets/page.tsx`, `src/app/(platform)/events/[id]/page.tsx` y `src/db/seed-data.ts`. Solo se elimina `getFeaturedEvents`, que queda sin uso.
  - Migraciones, cambios en `src/db/schema/*`, `drizzle/*`, `next.config.ts`, `proxy.ts`, `panel-nav.ts`, `src/app/layout.tsx`, `globals.css` o `package.json`. No se instala ningún componente shadcn (`switch` y `toggle` existen en el registro pero no hacen falta: `Button` con `aria-pressed` alcanza). **Por eso no hay tarea T0.**
  - Orden manual del carousel, límite de destacados aplicado en el admin, filtro "solo destacados" en el listado, que el organizador pida destacar, edición de `cover_alt` y subida de imágenes.
  - `HowItWorks` y `Newsletter`, que siguen estáticos.

## Reutilizar

- Datos y dominio:
  - `toLimaDate` (`event-list.utils.ts`).
  - `zoneOccupancy` (`event-facts-service.ts:20`), que se complementa con `zoneCapacity`.
  - `isEventReadOnly`, `getEventCapabilities` y el patrón de la policy (`event.policy.ts`); `can` (`user.permissions.ts`).
  - `loadVisibleEvent`, `MESSAGES`, `fail` y `failed` (`event-write-service.ts`).
  - `run()`, `eventIdSchema` e `INVALID_MESSAGE` (`actions.ts`).
  - `useEventMutation`, `unwrap` y `eventsInvalidationKey` (`use-event-mutations.ts`).
  - `getEventForEdit` y `listManagedEvents`, que se extienden sin duplicarse.
- UI:
  - `Hero`, `FeaturedEventsCarousel`, `EventCard` (ya tiene placeholder), `EventGrid` (ya tiene estado vacío con nombre de categoría), `CategoryCard`, `CategoryChips` y `SectionHeading`, todos sin cambios de props.
  - `Button` de shadcn (`aria-pressed`), íconos `Star`/`ImageIcon` de `lucide-react`.
  - Aviso del dashboard (`useOrganizerStore.setNotice` → banner `role="status"` de `OrganizerDashboard`).
- Patrones: precedente de schema inline sin archivo propio (`setStatusSchema`); precedente de no probar services con mocks de Drizzle.

## Archivos

Nuevos / modificados:

- `src/modules/event/event.policy.ts` + `event.policy.test.ts`: `canFeatureEvent`; `feature` en `getEventCapabilities`.
- `src/modules/event/event-write.types.ts`: `EventCapabilities.feature`, `EventForEdit.featured`.
- `src/modules/event/event-list.types.ts`: `ManagedEventRow.featured`.
- `src/modules/event/services/event-facts-service.ts`: `export const zoneCapacity`.
- `src/modules/event/services/event-list-service.ts`: `featured` en la fila; `selectZoneSales` usa `zoneCapacity`.
- `src/modules/event/services/event-form-service.ts`: `featured` en `getEventForEdit`.
- `src/modules/event/services/event-write-service.ts`: `setEventFeatured`.
- `src/modules/event/actions.ts`: `setEventFeaturedAction`; `run()` revalida `"/"`.
- `src/modules/event/hooks/use-event-mutations.ts` + `use-event-mutations.test.ts`: `setEventFeaturedMutation`, `useSetEventFeatured`; el `vi.mock` de actions agrega `setEventFeaturedAction`.
- `src/modules/event/event-public.utils.ts` + `event-public.utils.test.ts` (nuevos): `PublicEventRow`, `PublicZoneRow`, `LAST_TICKETS_RATIO`, `FEATURED_LIMIT`, `UPCOMING_LIMIT`, `availabilityStatus`, `summarizeZones`, `toPublicEvents`.
- `src/modules/event/services/event-public-service.ts` (nuevo): `listPublicCategories`, `listFeaturedEvents`, `listUpcomingEvents`.
- `src/modules/event/services/event-service.ts` + `event-service.test.ts`: se elimina `getFeaturedEvents` y su bloque de tests; ids de `CATEGORIES` = slugs; los tests usan `"conciertos"`/`"cine"`.
- `src/modules/event/event.types.ts`: solo comentarios (`imageUrl` vacío = sin portada; ids de categoría = slugs).
- `src/db/seed-data.ts`: `slug: id`.
- `src/app/page.tsx`: lee de `event-public-service`; ya no importa `event-service`.
- `src/components/Hero.tsx`, `src/modules/event/components/FeaturedEventsCarousel.tsx`, `src/modules/event/components/EventCard.tsx`, `src/modules/event/components/EventGrid.tsx`: carousel oculto sin eventos, `unoptimized`, placeholder, carousel sin CTA y `EventGrid.linked`.
- `src/modules/organizer/components/FeaturedToggle.tsx` (nuevo), `OrganizerEventRow.tsx`, `EventForm.tsx`.

Contratos entre tareas (para paralelizar T2 con T3 y T4 con todo):

- `EventCapabilities = { edit, publish, unpublish, cancel, delete, feature: boolean }`. Se suman `ManagedEventRow.featured: boolean` y `EventForEdit.featured: boolean`.
- `canFeatureEvent(actor: PolicyActor, event: PolicyEvent, now: Date): boolean`.
- `zoneCapacity: SQL<number>` exportado desde `event-facts-service.ts`. Requiere join con `venue_zone`, igual que `zoneOccupancy`.
- `setEventFeatured(actor: PolicyActor, eventId: string, featured: boolean): Promise<EventActionResult>`.
- `setEventFeaturedAction(input: unknown): Promise<EventActionResult>` con `input = { id: uuid, featured: boolean }`.
- `useSetEventFeatured()`: mutación de `{ id: string; featured: boolean }`; lanza el `error` de la action si `!ok`.
- `Event` no cambia de forma. `imageUrl === ""` = sin portada; `EventCategory.id` = slug.
- `EventGridProps.linked?: boolean` (default `true`); `false` → tarjetas sin enlace. T4 lo agrega, T3 lo usa en `page.tsx`.
- `FeaturedToggle`, props `{ eventId: string; title: string; featured: boolean; published: boolean; compact?: boolean; onToggled?: (message: string) => void }`:
  - Botón `type="button"` con `aria-pressed={featured}` y `aria-label` fijo `Destacar “{title}” en la portada`. Muestra estrella rellena si está destacado. Queda deshabilitado con `aria-busy` mientras guarda.
  - `compact` = solo ícono (`size-11`). Sin `compact` muestra además el texto "Destacar en la portada", con altura ≥ 44 px.
  - Mensajes de éxito:
    - Si se marca y está publicado: `“{title}” ahora aparece en la portada.`
    - Si se marca y no está publicado: `“{title}” quedó destacado: aparecerá en la portada cuando se publique.`
    - Si se desmarca: `“{title}” ya no aparece en la portada.`
  - Si recibe `onToggled`, le pasa el mensaje. Si no, lo muestra en un contenedor `role="status"` siempre montado.
  - Los errores siempre se muestran en línea con `role="alert"`.

## Criterios de aceptación

- AC1: **Sin migración**: el diff no toca `src/db/schema/*`, `drizzle/*` ni `next.config.ts`; se usa la columna `event.featured` existente.
- AC2: **Hero desde la DB**: el carousel muestra solo eventos `featured = true`, `published` y con `starts_at > now`, ordenados por `starts_at` ascendente, como máximo 5. Un evento destacado en `draft`, `cancelled` o ya empezado no aparece.
- AC3: **Sin destacados**: la landing muestra titular y buscador, sin carousel, sin espacio vacío extra y sin errores de consola.
- AC4: **Próximos eventos desde la DB**: eventos `published` con `starts_at > now`, por `starts_at` ascendente, como máximo 8, incluidos los destacados.
  - Con `?categoria=<slug>` válido solo aparecen los de esa categoría, la tarjeta y el chip quedan con `aria-current`.
  - Un slug desconocido o repetido se ignora y se muestran todos.
  - Sin resultados se ve el estado vacío de `EventGrid` ("Todavía no hay eventos de {label}").
- AC5: **Categorías desde la DB**: todas las filas de `category`, ordenadas por `label`, con `id = slug`, `label` e `icon` (`null` → `""` y sin ícono). Enlazan a `/?categoria=<slug>#eventos`. El breadcrumb del detalle (mock) enlaza a `/?categoria=conciertos#eventos` y la landing aplica ese filtro.
- AC6: **Mapeo** (`toPublicEvents`, puro):
  - `priceFrom` = mínimo `price_cents` / 100 de sus zonas.
  - `status` según "Disponibilidad", con `LAST_TICKETS_RATIO = 0.1`: capacidad 100 con ocupación 89 → `available`; con 90 → `last-tickets`; con 100 → `sold-out`; capacidad 0 → `sold-out`.
  - Zonas GA y numeradas se suman juntas.
  - `date` = día en Lima (un `starts_at` `2026-11-15T01:30Z` da `2026-11-14`).
  - Si no hay portada, `imageUrl` = `""`; si falta `cover_alt`, `imageAlt` = `title`.
- AC7: **Imágenes**: una portada `https` de un host fuera de `next.config.ts` se ve en las tarjetas y en el carousel sin error de `next/image`. Un evento sin portada muestra placeholder en la tarjeta, en el panel del carousel y en su miniatura.
- AC8: **Policy**: `canFeatureEvent` es `true` solo para `admin`/`super_admin` sobre eventos que no son de solo lectura. Es `false` para `organizer` (aunque sea dueño), `customer` y cualquier evento `cancelled`, `finished` o ya empezado. `getEventCapabilities` incluye `feature`.
- AC9: **Action**:
  - `setEventFeaturedAction` rechaza una entrada inválida (id no uuid o `featured` no booleano) con "Datos inválidos." sin tocar la DB.
  - Un `organizer` que la invoca directamente recibe `{ ok: false }`: sobre su propio evento, con el mensaje de permiso; sobre un evento ajeno, con "No encontramos el evento.". En ningún caso cambia `featured`.
  - Sobre un evento de solo lectura responde "Este evento ya no se puede modificar.".
  - Si sale bien devuelve `{ ok: true }` y revalida `/organizer` y `/`.
  - `createEventAction`/`updateEventAction` ignoran cualquier `featured` en la entrada: guardar el formulario no cambia el flag.
- AC10: **Listado `/organizer`**:
  - Cada fila con `capabilities.feature` muestra el toggle estrella con `aria-pressed` acorde, `aria-label` con el título y un objetivo de 44×44 px. Las filas sin `capabilities.feature` (por ejemplo, para un organizador) no lo muestran.
  - Tras el cambio, la fila se actualiza sin recargar (invalida `["events"]` + `router.refresh()`) y el banner del dashboard (`role="status"`) muestra el mensaje.
  - Un error se ve en la fila con `role="alert"`.
  - El grid de columnas no cambia.
- AC11: **Edición `/organizer/events/[id]/edit`**:
  - El admin ve el toggle con texto en el encabezado. Activarlo no envía el formulario ni descarta cambios sin guardar.
  - Tras `router.refresh()` el estado `aria-pressed` refleja la DB y el mensaje se anuncia en su `role="status"`.
  - No se muestra a organizadores ni en eventos de solo lectura.
- AC12: **Frescura**: después de destacar o quitar el destacado, o de publicar, despublicar, cancelar, editar o eliminar un evento, al navegar a `/` se ve el cambio sin recarga dura.
- AC13: **Higiene del mock**: `getFeaturedEvents` no existe y no tiene tests; `getUpcomingEvents` y `getCategories` se mantienen; ningún archivo usa ids `cat-*` (salvo los fixtures propios de `event-search.test.ts`); `src/app/page.tsx` no importa `event-service`.
- AC15: **Sin enlaces rotos en la landing**: `/` no contiene ningún `href` a `/events/<id>` ni `/events/<id>/tickets` (ni en tarjetas ni en el carousel). Las tarjetas de `/events` y los relacionados de `/events/[id]` siguen enlazando al detalle.
- AC14: `npm run lint`, `npx vitest run` y `npm run build` pasan. En la salida del build `/` aparece como dinámica (ƒ), así que el build no necesita conexión a la DB.

## Tests requeridos

Vitest, junto al archivo. Los services con DB no se prueban con mocks de Drizzle (precedente del repo); la lógica vive en funciones puras.

- `event-public.utils.test.ts` (AC6):
  - `availabilityStatus`: bordes 89/90/100 de 100, capacidad 0, ocupación mayor que capacidad.
  - `summarizeZones`: varios eventos mezclados; GA + numerada; mínimo de precio.
  - `toPublicEvents`: portada `null` → `""`; `cover_alt` `null` → `title`; centavos → unidades; día de Lima en un instante UTC de madrugada; evento sin zonas → `sold-out`/0; respeta el orden de entrada.
- `event.policy.test.ts` (AC8): `canFeatureEvent` × rol (`customer`, `organizer` dueño y ajeno, `admin`, `super_admin`) × estado (`draft`, `published`, `cancelled`, `finished`) × pasado (con `now` inyectado). Se actualizan los `toEqual` de `getEventCapabilities` (líneas 281-311) con `feature`.
- `use-event-mutations.test.ts` (AC9, AC10): `setEventFeaturedMutation` envía `{ id, featured }` y rechaza con el error de la action cuando `!ok`. El `vi.mock("@/modules/event/actions")` agrega `setEventFeaturedAction`.
- `event-service.test.ts` (AC13): sin el bloque `getFeaturedEvents`; filtros con `"conciertos"`/`"cine"`. `seed-data.test.ts` debe seguir pasando sin cambios.
- Sin test propio para el schema del toggle: es un `z.object` inline en `actions.ts`, como `setStatusSchema` (precedente). Su efecto se verifica a mano (AC9).
- Verificación manual (AC2–AC5, AC7, AC9–AC12) con el seed:
  - Como admin, destacar y quitar el destacado desde el listado y desde la edición, y comprobar `/`.
  - Como organizador, confirmar que no hay toggle y que la action invocada directamente responde que no tiene permiso.
  - Quitar todos los destacados y comprobar el Hero.
  - Cargar una portada de otro host y un evento sin portada.

## Tareas

### T1 — Dominio y lectura del flag
- Archivos: `src/modules/event/event.policy.ts` (+test), `src/modules/event/event-write.types.ts`, `src/modules/event/event-list.types.ts`, `src/modules/event/services/event-facts-service.ts`, `src/modules/event/services/event-list-service.ts`, `src/modules/event/services/event-form-service.ts`
- Depende de: —
- Paralelizable: sí (con T4)
- Cubre: AC8, AC10 (datos: `featured` + `capabilities.feature` en la fila), AC11 (datos: `featured` en `EventForEdit`); deja `zoneCapacity` listo para T3

### T2 — Escritura del flag: service, action y hook
- Archivos: `src/modules/event/services/event-write-service.ts`, `src/modules/event/actions.ts`, `src/modules/event/hooks/use-event-mutations.ts` (+test)
- Depende de: T1
- Paralelizable: sí (con T3 y T4; archivos disjuntos)
- Cubre: AC9, AC12

### T3 — Landing con datos reales
- Archivos: `src/modules/event/event-public.utils.ts` (+test), `src/modules/event/services/event-public-service.ts`, `src/modules/event/services/event-service.ts` (+test), `src/modules/event/event.types.ts`, `src/db/seed-data.ts`, `src/app/page.tsx`
- Depende de: T1 (`zoneCapacity`)
- Paralelizable: sí (con T2, T4 y T5)
- Cubre: AC1, AC2, AC4, AC5, AC6, AC13, AC14, AC15 (`page.tsx` pasa `linked={false}`)

### T4 — UI de la landing: Hero vacío, imágenes y placeholder
- Archivos: `src/components/Hero.tsx`, `src/modules/event/components/FeaturedEventsCarousel.tsx`, `src/modules/event/components/EventCard.tsx` (quitar la condición `preview || data:` de `unoptimized` y actualizar el comentario de `preview`), `src/modules/event/components/EventGrid.tsx` (prop `linked`)
- Depende de: — (el contrato de `Event` no cambia)
- Paralelizable: sí (con todas; debe terminar antes de T3 por `EventGrid.linked`)
- Cubre: AC3, AC7, AC15 (carousel sin CTA, `EventGrid.linked`)

### T5 — Toggle de destacado en el panel
- Archivos: `src/modules/organizer/components/FeaturedToggle.tsx` (nuevo), `src/modules/organizer/components/OrganizerEventRow.tsx`, `src/modules/organizer/components/EventForm.tsx`
- Depende de: T1, T2
- Paralelizable: sí (con T3 y T4)
- Cubre: AC10, AC11

## Preguntas abiertas

> **Resueltas por el humano (2026-10-05):** Pregunta 1 = **C** (quitar enlaces de la landing). Preguntas 2–11: se aceptan los valores por defecto.

1. **BLOQUEANTE: enlaces de la landing a eventos de la DB.**
   - Tarjetas y carousel enlazan a `/events/${id}` (`EventCard.tsx:79`, `FeaturedEventsCarousel.tsx:190`) y `/events/${id}/tickets` (`FeaturedEventsCarousel.tsx:183`). Esas rutas leen el mock (`getEventById` y `getVenueMap`, con `notFound()` si falta), y los ids de la DB son UUID, así que **todos los CTA de la landing darían 404** hasta la spec de detalle.
   - **Por defecto: A**, aceptar la fase 1 así (el detalle sigue en mock, como dejó `event-crud.md`).
   - **B**: priorizar antes el detalle desde la DB. Sería una spec propia de unas 4 tareas:
     1. Mappers puros DB → `EventDetail`/`VenueMap` + tests. `VenueMap.viewBox` y `stage` son constantes del mock (`venue-service.ts:193-194`) y no hay columnas para ellos, así que harían falta una constante compartida o columnas nuevas.
     2. Services de detalle, mapa y relacionados.
     3. Las **cuatro** rutas que usan `getEventById` + `getVenueMap`: detalle, `/tickets`, `/checkout` y `/confirmation`. Cambiar solo detalle y tickets rompe el paso a checkout.
     4. `/events` y `/my-tickets`.

     Archivos: `src/app/(platform)/events/[id]/page.tsx`, `src/app/(platform)/events/[id]/tickets/page.tsx`, `src/app/(platform)/events/[id]/checkout/page.tsx`, `src/app/(platform)/events/[id]/confirmation/page.tsx`, `src/app/(platform)/events/page.tsx`, `src/app/(platform)/my-tickets/page.tsx`, un par nuevo mapper + service para `EventDetail`/`VenueMap`, y la constante `viewBox`/`stage` que hoy está en `src/modules/booking/services/venue-service.ts:193-194`.

     El pago seguiría en mock (`order-service`), y el mock no se puede borrar porque `seed-data.ts` se construye desde él.
   - **C** (mitigación temporal): quitar los enlaces de tarjetas y carousel hasta la spec de detalle (peor experiencia, cero 404).

   ¿A, B o C?
2. **Hosts de portadas.** Por defecto, `unoptimized` en las portadas públicas, sin tocar `next.config.ts`; se pierde la optimización, pero las URLs del seed ya traen `w=800`. Alternativas: una allowlist fija de hosts en `remotePatterns` (iría en T0) o subir imágenes a un storage propio (spec aparte). ¿Aceptable?
3. **Límite y orden de destacados.** Por defecto, máximo 5 por `starts_at` ascendente: el riel es `lg:grid-cols-5` y el carousel monta todas las imágenes. Un 6.º destacado no se ve hasta que pase uno de los 5, y el admin no recibe aviso. Alternativas:
   - Sin límite (el riel salta de fila).
   - Bloquear en el admin al pasar de 5.
   - Orden manual: es **el único caso que justificaría una migración** (`featured_order` o `featured_at`).

   ¿Se quiere orden manual?
4. **Sin destacados.** Por defecto se oculta el carousel. Alternativa: rellenar con los próximos eventos, lo que obligaría a cambiar el rótulo "Destacado". ¿OK?
5. **Quién destaca.** Por defecto solo `admin`/`super_admin` (`event:moderate`); el organizador no ve el control ni puede pedirlo. ¿Correcto?
6. **Destacar borradores.** Por defecto se puede marcar cualquier evento que no sea de solo lectura (`draft` o `published`), y el Hero solo muestra publicados y futuros: el admin puede dejar listo un destacado antes de que se publique (el mensaje lo avisa). Un evento de solo lectura no puede cambiar su flag, pero tampoco se ve. Alternativa: solo `published`. ¿Cuál?
7. **Secciones que pasan a la DB.** Por defecto, Hero, categorías y "Próximos eventos"; `HowItWorks` y `Newsletter` siguen estáticos. ¿OK?
8. **Categorías.** Por defecto se muestran todas, aunque no tengan eventos (el layout `lg:grid-cols-8` está pensado para 8, y el estado vacío de `EventGrid` explica que no hay eventos de esa categoría), en orden alfabético por `label`. Un orden curado (como el del mock) requeriría `category.sort_order`, que sería una migración. ¿Ocultar las vacías? ¿Hace falta orden curado?
9. **Umbral de "Últimas entradas"**: por defecto ≤ 10 % de la capacidad restante (`LAST_TICKETS_RATIO`). ¿Otro valor, o un absoluto?
10. **Ids de categoría del mock alineados a los slugs.** Efecto colateral: `/events` pasa de `?categoria=cat-teatro` a `?categoria=teatro`, y cualquier enlace guardado con `cat-*` deja de filtrar. A cambio, la landing, `/events` y el breadcrumb del detalle comparten la misma identidad. ¿Aceptable?
11. **Orden de "Próximos eventos".** Por defecto incluye los destacados, como el mock. ¿Se prefiere excluirlos para no repetir los del Hero?

## Próximas fases

- Detalle, tickets, checkout y confirmación desde la DB (Pregunta 1), y relacionados desde la DB.
- `/events` (búsqueda, filtros y ciudades) y `/my-tickets` desde la DB; luego retirar del mock lo que ya no use el seed.
- Orden manual del carousel (`featured_order`, migración) y aviso en el admin cuando hay más destacados que espacios.
- Orden curado de categorías (`sort_order`, migración).
- Subida de portadas a un storage y edición de `cover_alt`.
