# CRUD de eventos del organizador y del admin

Estado: aprobada

## Objetivo

Hoy crear un evento en `/organizer/events/new` solo guarda un mock en el navegador (zustand `organizer.store`) y la fila "Editar"/"Ver ventas" del listado no hace nada. Esta spec persiste en la DB el ciclo de vida completo del evento y sus zonas con precio: **crear, editar, publicar/despublicar, cancelar y eliminar**, con la autorización decidida en el servidor por rol y propiedad.

Referencias: roles y propiedad en `system-design.md §3` ("Roles y autorización": el chequeo fino de propiedad va contra la DB); onboarding y gate de publicación en §5.6; cancelación en §5.4; tablas `event`, `event_zone`, `event_seat`, `organizer` en `erd.md §3` (Evento, Identidad), enums en §2 e invariantes en §4. Reglas de permisos en `src/modules/user/user.permissions.ts` (`event:manage-own`, `event:moderate`).

### Reglas de negocio acordadas

- **Eliminar (hard delete)**: solo si el evento no tiene órdenes ni reservas (ver "Definiciones"). Un borrador que nunca se publicó cumple siempre. Con órdenes no se borra: se **cancela** (`status='cancelled'`).
- **Publicar**: solo el organizador dueño y con `organizer.status='approved'`. Un organizador `pending`/`suspended` solo puede tener y editar borradores. El admin puede **despublicar** (`published` → `draft`) y **cancelar** cualquier evento.
- **Cancelar** solo marca `status='cancelled'`. No crea `refund` ni llama a Stripe (queda para la spec de reembolsos, ver "Próximas fases").
- **Con ventas** (ver "Definiciones"): fecha y recinto bloqueados; en cada zona con ocupación, precio bloqueado, no se puede quitar y la capacidad GA no puede bajar de lo ocupado; título, descripción, categoría y portada siguen libres.
- **Solo lectura**: eventos `cancelled`, `finished` o ya empezados.
- **Alcance**: evento + zonas con precio/capacidad del recinto elegido. Recinto y categoría se eligen de los existentes; no hay CRUD de recintos ni de categorías.

### Definiciones

- **Ocupación de una zona**: GA = `sold_count + held_count`; numerada = nº de `event_seat` en `sold` o `held`.
- **`hasSales`** (evento) = alguna zona con ocupación > 0, o existe una `orders` con estado distinto de `failed`/`cancelled`. Incluye lo reservado (`held`) a propósito.
- **`hasOrders`** (evento) = existe alguna fila en `orders` o en `reservation` con ese `event_id`, cualquiera sea su estado. Es lo que impide el hard delete: esas FKs no tienen cascade.
- **Pasado** = `startsAt <= now` o `status='finished'`. **Solo lectura** = pasado o `status` en (`cancelled`, `finished`). `now` se inyecta en las funciones puras (tests deterministas); hoy nada marca `finished` automáticamente.

## Alcance

- Incluye:
  - **Policy pura** `event.policy.ts`: `canCreateEvent`, `canViewEvent`, `canEditEvent`, `canPublishEvent`, `canUnpublishEvent`, `canCancelEvent`, `canDeleteEvent`, `editableFields`, `checkZoneChanges`, `getPublishBlockers`. Actor = `{ role, organizerId, organizerStatus }` (resuelto desde la sesión + la fila `organizer`). Matriz:
    - `customer`: todo denegado. `organizer`: solo eventos con `event.organizerId === actor.organizerId`. `admin`/`super_admin` (`can(role, "event:moderate")`): cualquier evento.
    - Crear: solo `role === 'organizer'` con fila `organizer` (cualquier estado; nace borrador). El admin no crea (no tiene `organizer`; ver Preguntas abiertas).
    - Editar y eliminar (dueño): estado del organizador `approved`, o evento en `draft`. Admin sin esa restricción. Editar exige no estar en solo lectura; eliminar exige `!hasOrders` (aunque el evento sea pasado o cancelado).
    - Publicar: solo el dueño `organizer`, `approved`, evento `draft`, no solo lectura y sin `getPublishBlockers`. El admin no publica (ver Preguntas abiertas).
    - Despublicar: evento `published` y no solo lectura; admin siempre; dueño `approved` solo si `!hasSales`.
    - Cancelar: no solo lectura y (`published`, o `draft` con `hasOrders`); admin siempre; dueño con la misma restricción de `approved`.
    - `editableFields(event, facts)`: `{ title, description, coverImageUrl, categoryId, startsAt, venueId }` booleanos; `startsAt` y `venueId` son `false` con `hasSales`; todos `false` si es solo lectura.
    - `checkZoneChanges(currentZones, nextZones)`: errores por `venueZoneId` (`price_locked`, `zone_in_use`, `capacity_below_occupied`) según la ocupación.
    - `getPublishBlockers(snapshot, now)`: lista de motivos (sin zonas, zona sin precio > 0, zona GA sin capacidad > 0, fecha no futura).
  - **Schema zod** `event-write.schema.ts`: una sola definición compartida por el formulario (validación en vivo) y el servidor. Entrada = valores del formulario (strings); salida = tipos de dominio (`startsAt: Date`, `priceCents`, `capacity`). Dos intenciones: `draft` (título ≥ 3, categoría, recinto, fecha y hora válidas y futuras; zonas opcionales pero válidas si vienen) y `publish` (además ≥ 1 zona). Una zona sin precio se descarta (significa "no se vende"); precio > 0 con hasta 2 decimales; capacidad entero ≥ 1. Portada: vacía o URL `https`.
  - **Utilidades puras** `event-write.utils.ts`: `parsePriceToCents` (sin errores de punto flotante), `toStartsAt(date, time)` (Lima, UTC-5), `nextAvailableSlug(base, taken)`.
  - **Servicios** (sin imports de `next/*`):
    - `event-write-service.ts`: `createEvent`, `updateEvent`, `deleteEvent`, `setEventStatus`. Escritura **sin transacciones interactivas** (ver "Concurrencia").
    - `event-facts-service.ts`: `getEventFacts(eventIds)` → `hasSales`/`hasOrders` por evento; también ocupación por zona de un evento.
    - `event-form-service.ts`: `listCategories()` (id + label, desde la DB), `listVenuesWithZones()` (recinto + `venue_zone` con tipo y capacidad GA/nº de asientos) y `getEventForEdit(actor, id)` (evento + zonas con ocupación + `canX` para la UI; `undefined` si no existe o el actor no puede verlo).
    - Slug: `slugify(title)` (movido a `src/lib/utils.ts`) + `nextAvailableSlug`; el slug **no cambia** al renombrar. Sin colisión → `slug`; con colisión → `slug-2`, `slug-3`…; si el UQ falla igual por una carrera, un reintento.
    - `event_seat`: al crear una `event_zone` de una `venue_zone` numerada se insertan sus `event_seat` (`available`) desde `venue_seat`. Al quitar una zona se borra su `event_zone` (cascade a `event_seat`) solo si está libre.
    - `event_zone.name` = nombre de la `venue_zone`; `max_per_order` queda en el default; `currency` queda en `PEN`.
  - **Server actions** (en `actions.ts`, junto a `listEventsAction`): `createEventAction`, `updateEventAction`, `deleteEventAction`, `setEventStatusAction`. Cada una: `requireRole("organizer")`, `safeParse` con zod, resuelve el actor y la fila `organizer` **desde la sesión** (nunca del input), llama al service y, si `ok`, `revalidatePath("/organizer")`. Retornan `{ ok: true, data? } | { ok: false, error }` sin filtrar detalles internos. La decisión de policy se toma **en el service** con los hechos leídos justo antes de escribir, no en la action (la action solo valida y autoriza el rol grueso, como indica `system-design.md §3` "Reglas de límite").
  - **`createEventAction` siempre crea un borrador**; publicar es solo `setEventStatusAction` (una única puerta con todos los chequeos). "Publicar" en el formulario = guardar + publicar en dos llamadas.
  - **Listado**: `ManagedEventRow` incorpora `capabilities: { edit, publish, unpublish, cancel, delete }` calculado en el servidor con la policy (la UI solo oculta; el servidor es el gate real).
  - **Hooks de mutación** `use-event-mutations.ts` (React Query): llaman a las actions, lanzan si `!ok` e invalidan `["events"]` (clave de `useEvents`) y refrescan la ruta (`router.refresh()`, para los KPIs que se calculan en el servidor).
  - **UI**:
    - `CreateEventForm` pasa a `EventForm` de uso doble (crear/editar), conectado a las actions reales; recinto y categoría salen de la DB; campos bloqueados deshabilitados con el motivo; modo solo lectura.
    - `TicketTypesEditor` evoluciona a **editor de zonas del recinto**: una fila fija por `venue_zone` (nombre, no editable) con precio y capacidad; precio vacío = no se vende; capacidad solo en zonas GA (editable, ≤ capacidad de la `venue_zone`); en zonas numeradas la capacidad es el nº de asientos (solo lectura).
    - `CoverImageInput` pasa de "subir archivo → data URL" a **campo de URL `https`** con vista previa (no se guardan imágenes base64 en la DB). Se muestra con `next/image` `unoptimized` para no depender de `remotePatterns` (ver Preguntas abiertas).
    - Nueva ruta `/organizer/events/[id]/edit`; `/organizer/events/new` pasa a leer categorías/recintos de la DB. Admin: puede abrir la edición de cualquier evento; `/organizer/events/new` lo redirige a `/organizer`.
    - Acciones por fila en `OrganizerEventRow`: Editar, Publicar/Despublicar, Cancelar, Eliminar según `capabilities`, con `AlertDialog` de shadcn (ya instalado) para despublicar, cancelar y eliminar; aviso de resultado y de error visibles.
    - Aviso post-guardado: `organizer.store` queda reducido a un `notice` en memoria (sin persist) con `setNotice`/`clearNotice`.
- No incluye:
  - **Gate de Stripe Connect** (`system-design.md §5.6` exige Connect completo para publicar) y **reembolsos reales** al cancelar (`§5.4`): cancelar solo marca `cancelled`. Va a la spec de refunds.
  - CRUD de recintos, zonas de recinto o categorías; subida de imágenes (la portada es URL); texto alternativo de portada (`cover_alt` queda `null`); `doors_open_at`, `min_age`, `featured`; `max_per_order` editable.
  - Que los eventos de la DB aparezcan en el sitio público: `/events` y el detalle siguen leyendo el mock de `event-service.ts`.
  - Crear eventos como admin en nombre de un organizador; publicar como admin.
  - Pantalla "Ver ventas", marcar `finished` automáticamente, auditoría de cambios, duplicar evento.
  - Cambios en `proxy.ts`, en el schema de la DB, en `next.config.ts`, en el driver de `src/db/index.ts` ni en `panel-nav.ts`.

## Concurrencia

El cliente `db` usa `drizzle-orm/neon-http`, que **no admite `db.transaction()`** (lanza "No transactions support in neon-http driver"). Por defecto, sin cambiar de driver:

- **Crear**: un único `db.batch([...])` (atómico en neon-http): `event` + `event_zone[]` + `event_seat` (insert-select desde `venue_seat`), con UUIDs generados antes para poder referenciarlos. O queda todo o no queda nada.
- **Editar**: primero se leen los hechos (`getEventFacts`, ocupación por zona) y se decide con la policy pura (da el mensaje claro). Luego se escribe con `db.batch` donde **cada sentencia sensible a ventas lleva su guarda en el `WHERE`**, en el estilo de `erd.md §4`: fecha/recinto del evento con `NOT EXISTS` de ventas/ocupación; precio de zona y borrado de zona solo con ocupación 0; capacidad GA con `sold_count + held_count <= capacidad`. Si una sentencia guardada afecta 0 filas, el service responde "Las ventas cambiaron: recarga e intenta de nuevo". Los invariantes de datos se mantienen aunque llegue una compra en medio; lo único que puede pasar en esa ventana es una aplicación parcial, que el aviso comunica.
- **Eliminar**: una sola sentencia `DELETE FROM event WHERE id = ? AND NOT EXISTS (orders…) AND NOT EXISTS (reservation…)` (zonas y asientos caen por cascade). 0 filas → "Tiene ventas: cancélalo".
- **Estado**: compare-and-set `UPDATE event SET status = ? WHERE id = ? AND status = <anterior>` (más `NOT EXISTS` de ventas al despublicar como organizador y, al publicar, la existencia de zonas y fecha futura).

## Reutilizar

- `requireRole`, `getCurrentUser` (`current-user.ts`); `can`, `hasRole` (`user.permissions.ts`); `UserRecord`.
- Patrón de `resolveEventScope` (función pura con `can`) y de `listManagedEvents`/`scopeCondition` en `event-list-service.ts` (se extiende, no se duplica); `toLimaDate`, `aggregateZoneSales` de `event-list.utils.ts`; `escapeLike`.
- Patrón de actions de `user/actions.ts` (`run()` + `revalidatePath`) y de `listEventsAction` (`safeParse`, mensaje genérico, `console.error`).
- `useEvents`/`eventsQueryKey` (`hooks/use-events.ts`) para invalidar.
- Esquema `src/db/schema/event.ts`, `identity.ts`, `venue.ts`, `order.ts`, `reservation.ts` (`eventStatus`, `organizerStatus`, `eventSeatStatus`); no se toca el schema.
- UI: `CreateEventForm`, `TicketTypesEditor`, `CoverImageInput`, `OrganizerEventRow`, `OrganizerDashboard`, `EventCard` (vista previa), shadcn `alert-dialog`, `button`, `input`, `select`, `form-field`, `badge` (ya instalados; no hace falta `shadcn add`).
- Patrón `PageProps<"/…">` con `params` async de `src/app/(platform)/events/[id]/page.tsx` (Next 16, ver `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` para Server Actions).
- `slugify` hoy vive en `src/db/seed-data.ts`: se mueve a `src/lib/utils.ts` (no se duplica ni se importa seed desde un service).

## Archivos

Nuevos / modificados:

- `src/lib/utils.ts` + `utils.test.ts` (`slugify` movido aquí), `src/db/seed-data.ts` y `src/db/seed-data.test.ts` (importan `slugify` de `@/lib/utils`; el test de `slugify` se mueve a `utils.test.ts`)
- `src/modules/user/services/user-service.ts` (`findOrganizerByUserId(userId)` → `{ id, status } | undefined`)
- `src/modules/event/event.policy.ts` + `event.policy.test.ts`
- `src/modules/event/event-write.schema.ts` + `event-write.schema.test.ts`
- `src/modules/event/event-write.utils.ts` + `event-write.utils.test.ts`
- `src/modules/event/event-write.types.ts` (`EventFormValues`, `EventWriteInput`, `PolicyActor`, `EventFacts`, `ZoneState`, `EventActionResult<T>`, `EventCapabilities`, `EventForEdit`, `EventFormOptions`)
- `src/modules/event/services/event-facts-service.ts`, `event-write-service.ts`, `event-form-service.ts`
- `src/modules/event/actions.ts` (4 actions nuevas)
- `src/modules/event/event-list.types.ts` (`capabilities` en `ManagedEventRow`), `src/modules/event/services/event-list-service.ts` (calcula `capabilities`)
- `src/modules/event/hooks/use-event-mutations.ts` + `use-event-mutations.test.ts`
- `src/modules/organizer/components/EventForm.tsx` (reemplaza `CreateEventForm.tsx`, que se elimina), `TicketTypesEditor.tsx` (editor de zonas), `CoverImageInput.tsx` (URL)
- `src/app/(admin)/organizer/events/new/page.tsx`, `src/app/(admin)/organizer/events/[id]/edit/page.tsx` (nuevo)
- `src/modules/organizer/organizer.store.ts` + test (reducidos a `notice`); se eliminan `create-event.schema.ts` + test y `organizer.types.ts` (sus usos pasan a `event-write.*`)
- `src/modules/organizer/components/OrganizerEventRow.tsx`, `OrganizerDashboard.tsx`, `src/app/(admin)/organizer/page.tsx` (acciones por fila, botón "Crear evento" solo si `canCreateEvent`)

Contratos entre tareas (para poder paralelizar T4 y T5):

- `EventActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }`.
- Actions: `createEventAction(input) → { id: string }`, `updateEventAction({ id, ...values }) → void`, `deleteEventAction({ id }) → void`, `setEventStatusAction({ id, status: "published" | "draft" | "cancelled" }) → void`.
- `EventCapabilities = { edit, publish, unpublish, cancel, delete: boolean }` en `ManagedEventRow.capabilities`.
- `organizer.store`: `notice: string | null`, `setNotice(message)`, `clearNotice()`.

## Criterios de aceptación

- AC1: la policy se comporta según la matriz del Alcance: un `organizer` solo opera sobre eventos de su propia fila `organizer`; `admin`/`super_admin` sobre cualquiera; `customer` y sesión sin rol, nada; el `organizerId` nunca viene del input del cliente.
- AC2: crear guarda un `event` en `draft` con `organizer_id` de la sesión, `slug` único (colisión → sufijo `-2`, `-3`…), `currency='PEN'` y sus `event_zone`; las zonas numeradas generan sus `event_seat` `available`. Todo en un `db.batch`: si falla, no queda un evento a medias. Un admin recibe error al crear; un organizador `pending`/`suspended` puede crear borradores.
- AC3: `categoryId`, `venueId` y cada `venueZoneId` deben existir; cada zona debe pertenecer al recinto elegido; cualquier otro caso responde error sin tocar la DB. Una zona GA exige capacidad entre 1 y la `capacity` de su `venue_zone`; una numerada ignora la capacidad.
- AC4: fecha y hora (Lima) deben ser futuras, precio > 0 y capacidad ≥ 1; título ≥ 3 caracteres; portada vacía o `https`. Los mismos mensajes salen en el formulario (en vivo) y en el servidor.
- AC5: publicar exige dueño `organizer` con `status='approved'`, evento en `draft` no pasado y sin `getPublishBlockers` (≥ 1 zona con precio > 0, GA con capacidad, fecha futura). Un organizador `pending`/`suspended` no puede publicar (el botón muestra el motivo) ni lo logra llamando la action directamente; el admin tampoco publica.
- AC6: despublicar (`published` → `draft`): el admin siempre; el organizador dueño solo sin `hasSales`. Cancelar (`→ cancelled`): el dueño aprobado o el admin sobre un evento `published` (o `draft` con órdenes) no pasado. Cancelar solo cambia `status`: no crea `refund` ni llama a Stripe; el diálogo lo dice ("Los reembolsos no se procesan automáticamente todavía").
- AC7: eliminar solo si no hay `orders` ni `reservation` del evento; borra el evento y por cascade sus zonas y asientos. Con órdenes responde "Tiene ventas: cancélalo" y no borra; la fila no ofrece "Eliminar" sino "Cancelar". Un evento sin órdenes se puede borrar aunque esté `cancelled` o ya haya pasado.
- AC8: con `hasSales`: fecha y recinto no se pueden cambiar (campo deshabilitado en la UI y rechazo en el servidor si el valor difiere); en zonas con ocupación el precio no cambia, la zona no se quita y la capacidad GA no baja de `sold_count + held_count`; sí se pueden agregar zonas nuevas y editar título, descripción, categoría y portada. Sin ventas todo lo editable cambia libremente (cambiar de recinto reemplaza sus zonas).
- AC9: eventos `cancelled`, `finished` o ya empezados: el formulario abre en solo lectura con aviso; `updateEventAction` y `setEventStatusAction` los rechazan aunque se invoquen directamente (salvo eliminar sin órdenes, AC7).
- AC10: sin condiciones de carrera que rompan invariantes: capacidad GA, precio de zona y borrado de zona/evento van con su guarda en el `WHERE`; el estado se cambia por compare-and-set. Si una guarda no aplica, el usuario ve "Las ventas cambiaron: recarga e intenta de nuevo" y nunca queda `sold_count + held_count > capacity`.
- AC11: `/organizer` lista con `capabilities` por fila; la UI oculta lo que la policy niega. Tras cada acción exitosa el listado y las tarjetas de KPI se actualizan sin recargar (invalidación de `["events"]` + `router.refresh()`), con aviso `role="status"`; los errores del servidor se muestran sin cerrar el diálogo.
- AC12: el formulario de crear ya no usa zustand ni `localStorage` para los eventos: crea en la DB y redirige a `/organizer` con el aviso ("Guardamos … como borrador" / "… se publicó"). "Publicar" = crear/guardar + `setEventStatusAction`; si la publicación falla, el evento queda guardado como borrador y se redirige a su edición con el error.
- AC13: toda action valida con zod, exige `requireRole("organizer")`, devuelve `{ ok, error }` con mensajes genéricos (el detalle se registra con `console.error`) y refresca `/organizer`.
- AC14: accesibilidad: diálogos con título, foco atrapado y cierre con Esc; botones de acción con `aria-label` que incluye el título del evento; targets ≥ 44 px; campos bloqueados con `aria-describedby` al motivo; errores asociados con `aria-invalid`.
- AC15: `npm run lint`, `npx vitest run` y `npm run build` pasan.

## Tests requeridos

Vitest, junto al archivo (los services con DB no se prueban con mocks de Drizzle, precedente del repo; la lógica de decisión vive en funciones puras):

- `event.policy.test.ts`: cada función × rol (`customer`, `organizer` dueño y ajeno, sin fila `organizer`, `admin`, `super_admin`) × estado del organizador (`pending`/`approved`/`suspended`) × estado del evento × `hasSales`/`hasOrders` × pasado (con `now` inyectado); `editableFields`; `checkZoneChanges` (precio bloqueado, zona en uso, capacidad bajo lo ocupado, zona nueva permitida); `getPublishBlockers` (AC1, AC5–AC9).
- `event-write.schema.test.ts`: intención `draft` vs `publish`, fecha pasada, precio `0`/`1.234`/`abc`, capacidad `0`, zona sin precio descartada, portada no `https`, trim del título (AC3, AC4).
- `event-write.utils.test.ts`: `parsePriceToCents` (`"120"`, `"120.5"`, `"0.1"`, `"19.99"`), `toStartsAt` (offset de Lima), `nextAvailableSlug` (sin colisión, `-2`, `-3`, hueco) (AC2).
- `utils.test.ts`: `slugify` (movido) con acentos y caracteres especiales; `seed-data.test.ts` ajustado.
- `use-event-mutations.test.ts`: lanza el error de la action cuando `!ok` y usa la clave `["events"]` para invalidar (AC11).
- `organizer.store.test.ts`: `setNotice`/`clearNotice`.
- Verificación manual de los services y de la UI (AC2, AC7, AC10): crear, editar con y sin ventas simuladas en el seed, eliminar, cancelar.

## Tareas

### T1 — Base y dominio puro
- Archivos: `src/lib/utils.ts` (+test), `src/db/seed-data.ts`, `src/db/seed-data.test.ts`, `src/modules/user/services/user-service.ts`, `src/modules/event/event.policy.ts` (+test), `event-write.schema.ts` (+test), `event-write.utils.ts` (+test), `event-write.types.ts`
- Depende de: —
- Paralelizable: sí (primera tarea; las demás dependen de ella)
- Cubre: AC1, AC3 (parte pura), AC4, AC5 (policy), AC6 (policy), AC8 (reglas), AC9 (policy)

### T2 — Servicios de escritura y lectura
- Archivos: `src/modules/event/services/event-facts-service.ts`, `event-write-service.ts`, `event-form-service.ts`
- Depende de: T1
- Paralelizable: no
- Cubre: AC2, AC3, AC5, AC6, AC7, AC8, AC9, AC10

### T3 — Actions, capacidades del listado y hooks de mutación
- Archivos: `src/modules/event/actions.ts`, `event-list.types.ts`, `services/event-list-service.ts`, `hooks/use-event-mutations.ts` (+test)
- Depende de: T1, T2
- Paralelizable: no
- Cubre: AC1, AC11 (datos), AC13

### T4 — Formulario, editor de zonas y rutas new/edit
- Archivos: `src/modules/organizer/components/EventForm.tsx` (elimina `CreateEventForm.tsx`), `TicketTypesEditor.tsx`, `CoverImageInput.tsx`, `src/app/(admin)/organizer/events/new/page.tsx`, `src/app/(admin)/organizer/events/[id]/edit/page.tsx`, `src/modules/organizer/organizer.store.ts` (+test), eliminación de `create-event.schema.ts` (+test) y `organizer.types.ts`
- Depende de: T1, T3
- Paralelizable: sí con T5 (archivos disjuntos; comparten el contrato de `organizer.store` y de las actions)
- Cubre: AC3, AC4, AC8 (UI), AC9 (UI), AC12, AC14

### T5 — Acciones por fila y dashboard
- Archivos: `src/modules/organizer/components/OrganizerEventRow.tsx`, `OrganizerDashboard.tsx`, `src/app/(admin)/organizer/page.tsx`
- Depende de: T3
- Paralelizable: sí con T4
- Cubre: AC5 (UI), AC6 (UI), AC7 (UI), AC11, AC14, AC15 (integración)

## Preguntas abiertas

1. **Transacciones.** El driver actual (`neon-http`) no tiene `db.transaction()`. Por defecto se usa `db.batch` (atómico) + sentencias con guarda en el `WHERE`; la única ventana es una aplicación parcial si una compra llega en medio de una edición. Alternativa: pasar `src/db/index.ts` a `drizzle-orm/neon-serverless` (Pool/WebSocket) y usar `db.transaction` con `SELECT … FOR UPDATE` del evento (todo o nada, pero cambia infra compartida y hay que verificar WebSocket en Node 24 y en Cloud Run). Además `system-design.md §4` dice que prod usa `pg` + Cloud SQL, donde `db.batch` no existe: el service está aislado, pero el swap de driver tocará `event-write-service.ts`. ¿Mantenemos `batch` por defecto?
2. **Admin y el listado.** Se asume que el admin reutiliza `/organizer` (mismo listado con alcance "todos") y abre la edición de cualquier evento. Por defecto **no crea ni publica** eventos: crear exige una fila `organizer` y `organizerId` siempre sale de la sesión; publicar es acto del organizador. ¿Admin crea "a nombre de" un organizador y/o publica?
3. **Portada como URL.** `CoverImageInput` hoy genera un JPEG base64 pensado para localStorage; guardarlo en `cover_image_url` pone ~100 KB por evento en Postgres. Por defecto la portada es una URL `https` (sin `data:`) mostrada con `next/image` `unoptimized`, porque `next.config.ts` solo permite `images.unsplash.com` y no se quiere una lista abierta. Alternativas: allowlist fija de hosts, o subir imágenes a un storage (spec aparte). ¿Aceptable?
4. **Borrador exige más que el nombre.** `event.venue_id`, `category_id` y `starts_at` son `NOT NULL`, así que un borrador necesita título, categoría, recinto y fecha (hoy el mock aceptaba solo el nombre). ¿Aceptable, o se prefiere relajar el schema de la DB?
5. **Organizador sin fila `organizer`** (rol `organizer` pero sin perfil): crear se rechaza con "Completa tu perfil de organizador". ¿Debe crearse la fila `pending` automáticamente?
6. **Organizador `suspended`/`pending` con eventos ya publicados**: por defecto queda en solo lectura para él (solo opera sobre borradores) y el admin decide. ¿Se despublican automáticamente al suspenderlo? Hoy `setOrganizerStatus` no toca sus eventos.
7. **Despublicar con ventas**: por lo acordado solo el admin puede; el evento vuelve a `draft` con órdenes, no se puede borrar y el organizador puede republicarlo. ¿O el admin debería cancelar en vez de despublicar?
8. **Capacidad GA ≤ `venue_zone.capacity`**: se asume que el evento no puede vender más que la capacidad del recinto. ¿Correcto, o el organizador define libremente?
9. **Zona horaria**: fecha y hora se interpretan en Lima (UTC-5), como `toLimaDate` en el listado. Los recintos sembrados de Madrid y Ciudad de México quedarían con la hora desfasada; el seed usa un offset por ciudad. ¿Se guarda una zona horaria por recinto en esta fase?
10. **Discrepancias con `docs/architecture`** (manda la spec; no se modifican esos docs): (a) `erd.md §3` dice que `event_seat` "se genera al publicar"; aquí se genera al crear la zona (acordado) para que el editor de zonas y la ocupación funcionen en borrador. (b) `system-design.md §5.6` exige Connect completo para publicar: fuera de alcance por decisión (gate solo por `organizer.status`). (c) `§5.4` crea reembolsos al cancelar: fuera de alcance; si ya existieran órdenes pagadas, cancelar dejaría compradores sin reembolso hasta la spec de refunds (hoy el checkout es mock y no hay órdenes).
11. **Bloqueo contra compras concurrentes**: el futuro checkout deberá usar las mismas guardas (`UPDATE … WHERE sold_count + held_count + n <= capacity`, `erd.md §4`) y respetar el estado del evento (no vender un evento `draft`/`cancelled`); esta spec no toca el checkout.

## Próximas fases

- **Reembolsos al cancelar** (`refund` `event_cancelled` por `payment` pagado, Stripe, `ticket` → `refunded`) y aviso a compradores.
- **Gate de Stripe Connect** para publicar (`stripe_onboarding_status = 'complete'`).
- Admin crea eventos en nombre de un organizador; admin publica.
- Eventos de la DB en el sitio público (`/events`, detalle, disponibilidad real) reemplazando el mock de `event-service.ts`.
- Subida de imágenes de portada y texto alternativo (`cover_alt`).
- Marcar `finished` automáticamente (job) y pantalla "Ver ventas" por evento.
- Zona horaria por recinto; `doors_open_at`, `min_age`, `max_per_order` editables.
- Pasar a transacciones interactivas si cambia el driver (Pregunta 1).
