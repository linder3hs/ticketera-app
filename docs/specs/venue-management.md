# Gestión de recintos: venues, zonas y asientos

Estado: aprobada

## Objetivo

Hoy los recintos solo existen por el seed: el formulario de evento los lista (`listEventFormOptions`), pero nadie puede crear, corregir ni borrar uno. Esta spec agrega el CRUD de `venue`, de sus `venue_zone` (numerada o de pie, capacidad, color, forma en el mapa) y de sus `venue_seat` (generador por filas), con permisos por rol y propiedad, y el bloqueo de zonas y asientos cuando el recinto ya vendió entradas.

Hecho cuando: un admin u organizador crea un recinto nuevo, le agrega zonas (y asientos si son numeradas) y ese recinto aparece en el selector del formulario de evento con sus zonas, listo para crear un evento.

Decisión humana ya tomada: **admin y organizador pueden crear recintos**. Eso exige `venue.created_by` (FK a `user`, nullable; los recintos del seed quedan en `null`). `erd.md §3` (grupo Recinto) no tiene esa columna y `system-design.md §6` ("Propiedad de `venue`") deja la decisión pendiente: manda esta spec y la discrepancia se reporta en "Preguntas abiertas" (los docs de arquitectura no se modifican).

Referencias: roles y chequeo fino de propiedad contra la DB en `system-design.md §3` ("Roles y autorización" y "Reglas de límite"); tablas `venue`, `venue_zone`, `venue_seat` en `erd.md §3` (Recinto), enum `seating_type` en §2, invariantes e índices en §4–5; geometría del mapa pendiente de UI en `system-design.md §6` ("Mapa de asientos"). Esta spec reemplaza el "no hay CRUD de recintos" de `docs/specs/event-crud.md` ("No incluye").

### Definiciones

Hechos del schema que mandan sobre las reglas (los FKs de abajo **no** tienen cascade):

- `event.venue_id`, `event_zone.venue_zone_id` y `event_seat.venue_seat_id` apuntan al recinto, zona y asiento. Borrar `venue` sí cascadea a sus `venue_zone` y `venue_seat`.
- **`isReferenced`** (recinto) = existe algún `event` con ese `venue_id`, en cualquier estado. **`isReferenced`** (zona) = existe algún `event_zone` con ese `venue_zone_id`. Impide borrar y cambiar el tipo (`seating_type`).
- **`hasSales`** (recinto) = algún `event` del recinto cumple `eventHasSales` de `event-facts-service.ts` (hay una `orders` que no es `failed`/`cancelled`, o una zona con ocupación `sold`+`held` > 0). Es la misma definición que usa el módulo de eventos, a propósito: incluye lo reservado (`held`) y no "se destiñe" al reembolsar. Se reutiliza el fragmento SQL exportado, no se reescribe.
- **`minCapacity`** (zona GA) = la mayor `event_zone.capacity` entre las `event_zone` que la usan (0 si ninguna). `event_zone.capacity` es una copia propia del evento: cambiar `venue_zone.capacity` no toca eventos existentes, pero el formulario de evento valida contra ella (`event-write-service.ts`: capacidad GA ≤ `venue_zone.capacity`).
- **Zona utilizable** = GA con `capacity ≥ 1`, o numerada con ≥ 1 `venue_seat` (la capacidad de una numerada se calcula contando asientos). Un recinto sin zonas utilizables se puede elegir, pero su evento no se puede publicar (`getPublishBlockers` ya lo cubre).
- **Actor** = `{ id, role }` de `UserRecord` (sesión). `created_by` es FK a `user`, no a `organizer`: el admin no tiene fila `organizer`. No se reutiliza `PolicyActor` de eventos.

### Reglas de negocio acordadas

- **Ver y usar**: todo rol `organizer` o superior ve todos los recintos y los puede elegir en sus eventos; la edición es lo restringido. Un organizador no ve quién creó los recintos ajenos (solo "Tuyo" / "Plataforma" / "De otro organizador").
- **Crear**: `organizer`, `admin`, `super_admin`. `created_by` sale siempre de la sesión, nunca del input.
- **Editar y eliminar** (datos básicos, zonas, asientos): admin y super_admin cualquier recinto; organizador solo los que tiene `created_by = su id`; los del seed (`created_by = null`) solo admin. Customer: nada.
- **Con `hasSales`**: zonas y asientos quedan en solo lectura (no se crean, editan, borran ni regeneran asientos). Los datos básicos del recinto (nombre, dirección, ciudad, lat/lng) siguen editables.
- **Sin ventas pero zona `isReferenced`** (la usa algún evento): no se borra, no cambia de tipo y no se regeneran sus asientos (los `event_seat` ya son copia de los `venue_seat`); nombre, color, forma, orden y capacidad GA (nunca por debajo de `minCapacity`) sí se editan.
- **Eliminar recinto**: hard delete solo si no está `isReferenced` (sin eventos, de cualquier estado); cascadea a zonas y asientos. Con eventos no se borra y el mensaje lo dice. No hay baja lógica.

## Alcance

- Incluye:
  - **Migración Drizzle** que agrega `venue.created_by uuid null references "user"(id) on delete set null`. Sin backfill: los recintos existentes quedan en `null` (solo admin). El humano aplica la migración (`npm run db:migrate`); el developer solo la genera con `npm run db:generate`.
  - **Permisos** en `user.permissions.ts`: `venue:manage-own` (mínimo `organizer`) y `venue:moderate` (mínimo `admin`); la policy decide con `can()`, sin comparar roles a mano.
  - **Policy pura** `venue.policy.ts`: `canCreateVenue`, `canEditVenue(actor, venue)`, `canDeleteVenue(actor, venue, facts)`, `canEditZones(actor, venue, facts)`, `getZoneCapabilities(zoneFacts)` (`{ delete, changeType, generateSeats, minCapacity }`), `getVenueCapabilities(actor, venue, facts)` → `{ edit, delete, editZones }`, `checkZoneChange(currentZone, nextZone, zoneFacts)` (errores `type_locked`, `capacity_below_in_use`).
  - **Schemas zod** `venue.schema.ts`, uno por entrada, compartidos por el formulario (validación en vivo) y el servidor; entrada = strings del formulario, salida = tipos de dominio (mismo patrón que `event-write.schema.ts`):
    - `venueSchema`: `name` 2–120 (trim), `address` 2–200, `city` 2–80; `lat` ∈ [-90, 90] y `lng` ∈ [-180, 180] opcionales y **ambos o ninguno**. Inputs numéricos, sin picker de mapa. `google_place_id` queda fuera.
    - `zoneSchema`: `name` 1–60; `seatingType`; `capacity` entero 1–100 000 (obligatoria si es GA, se descarta si es numerada); `color` `#RRGGBB`; `sortOrder` entero ≥ 0; `shape` opcional (ver abajo).
    - `seatGeneratorSchema`: `rows` 1–50, `seatsPerRow` 1–100, `firstRowLabel` `^[A-Z]{1,2}$` (default `A`), `startNumber` entero ≥ 1 (default 1); `rows × seatsPerRow ≤ 2000` por generación.
  - **Forma de la zona en el mapa** (dato): se guarda en `venue_zone.map_shape` el formato que el mapa público ya lee, `{ path, labelX, labelY }` (viewBox `0 0 800 540`, `VENUE_VIEWBOX`), más los parámetros que la generaron: `{ kind: "rectangle" | "ellipse", x, y, width, height }`. El mapa público ignora las claves extra (su zod las descarta). La entrada del usuario son solo esos 5 parámetros (`x ≥ 0`, `y ≥ 0`, `width ≥ 20`, `height ≥ 20`, dentro de 800×540); `buildZoneShape(params)` produce `path` y la etiqueta (centro). Las zonas del seed, sin `kind`, se muestran como "Forma personalizada" y se conservan tal cual salvo que el usuario elija una forma nueva. Sin forma: la zona se lista y no se dibuja (comportamiento actual de `EMPTY_ZONE_SHAPE`).
  - **Utilidades puras** `venue.utils.ts`:
    - `buildZoneShape`.
    - `rowLabelAt(firstLabel, index)`: A…Z, AA, AB…
    - `generateSeats({ rows, seatsPerRow, firstRowLabel, startNumber })` → `{ rowLabel, seatNumber, x, y }[]`. Coordenadas en grilla determinista con el mismo criterio del mock/seed: separación 28, `x = (col − (seatsPerRow − 1) / 2) × 28`, `y = row × 28`, un decimal. Son obligatorias: con `x/y = null` el mapa de asientos (`venue-map.utils.ts`: `x ?? 0`) apila todos los asientos en el mismo punto y el recinto no sería comprable.
    - `summarizeVenue(zones)` → `{ zoneCount, seatCount, capacity, usable }`.
  - **Servicios** (sin imports de `next/*`; el driver es `neon-http`, sin `db.transaction()`, como en event-crud):
    - `venue-facts-service.ts`: `getVenueFacts(venueIds)` → `{ isReferenced, hasSales }`; `getZoneFacts(venueId)` → por zona `{ isReferenced, minCapacity }`; exporta el fragmento SQL `venueHasSales(venueId)` (`exists (select 1 from event where event.venue_id = ? and <eventHasSales(event.id)>)`) para usarlo de guarda. Los fragmentos de `event-facts-service.ts` (`eventHasSales`, `zoneOccupancy`) usan `venue_zone`, `event_zone` y `event_seat` sin alias: `hasSales` del recinto se calcula en su propia consulta y esos fragmentos **nunca** se incrustan en una consulta cuyo `FROM` sea `venue_zone` (`getZoneFacts` calcula `isReferenced` y `minCapacity` con subconsultas sobre `event_zone` solamente).
    - `venue-service.ts` (lecturas): `listVenues(actor)` (todos los recintos con `summarizeVenue`, "Tuyo/Plataforma/Otro" y `capabilities`) y `getVenueForEdit(actor, id)` (valores del formulario, zonas con nº de asientos, hechos y `capabilities`; `undefined` si no existe o el id no es uuid).
    - `venue-write-service.ts`: `createVenue`, `updateVenue`, `deleteVenue`, `createZone`, `updateZone`, `deleteZone`, `generateSeats`. Cada una vuelve a leer el recinto y decide con la policy (nunca confía en la UI) y devuelve `VenueActionResult`.
  - **Concurrencia (sin transacciones interactivas)**: borrar recinto/zona = una sentencia `DELETE … WHERE id = ? AND NOT EXISTS (referencias)`; 0 filas → mensaje "Está en uso por un evento". Crear/editar/borrar zonas lleva en el `WHERE` la guarda `NOT venueHasSales(venue)`. Regenerar asientos = un `db.batch([delete, insert])` atómico (máx. 2000 filas, un solo insert); si entre la lectura y el batch un evento tomó la zona, el FK `event_seat.venue_seat_id` rechaza el `delete` y el batch revierte (se mapea con `pgErrorCode` de `src/lib/pg-error.ts`, código `23503`). Única ventana aceptada: una zona numerada que aún no tenía asientos y se usa en un evento en ese instante.
  - **Generar asientos reemplaza**: borra todos los `venue_seat` de la zona e inserta la grilla nueva (respeta `UQ(zone, row_label, seat_number)`). Solo zonas numeradas y no referenciadas. No hay alta/baja asiento por asiento.
  - **Cambio de tipo** (solo zona no referenciada): numerada → GA borra sus asientos y exige capacidad; GA → numerada pone `capacity = null` y queda sin asientos hasta generar.
  - **Server actions** (`actions.ts`): `createVenueAction`, `updateVenueAction`, `deleteVenueAction`, `createZoneAction`, `updateZoneAction`, `deleteZoneAction`, `generateSeatsAction`. Cada una: `requireRole("organizer")`, `safeParse` con zod, actor desde la sesión, llama al service y, si `ok`, `revalidatePath("/organizer/venues")`, `revalidatePath("/")` y `revalidatePath("/events", "layout")` en **toda** acción exitosa: el nombre, el color, la forma y los asientos de una zona usada por un evento publicado (sin ventas) los muestra el detalle y el mapa públicos de `/events/[slug]`. Retornan `{ ok: true, data } | { ok: false, error }` con mensajes genéricos (el detalle va a `console.error`). Viven en T2 (capa fina sobre los services) para que T3 y T4 las importen ya terminadas.
  - **UI** (panel, ruta bajo `/organizer` por ya estar protegida por `proxy.ts` y por `OrganizerLayout`; el admin entra por la jerarquía de roles):
    - Ítem "Recintos" en la sección "Organizador" del menú.
    - `/organizer/venues`: tabla con nombre, ciudad, zonas, asientos, capacidad, propietario ("Tuyo/Plataforma/De otro organizador"), insignia "Sin zonas utilizables" y acciones Editar (o "Ver") y Eliminar según `capabilities`. Botón "Crear recinto".
    - `/organizer/venues/new`: `VenueForm` (nombre, dirección, ciudad, lat, lng). Al crear, redirige a `/organizer/venues/[id]` para agregar zonas.
    - `/organizer/venues/[id]`: `VenueForm` + editor de zonas (lista con alta/edición/baja), `ZoneMapPreview` (SVG con escenario y zonas coloreadas), formulario de zona (nombre, tipo, capacidad GA, color con `<input type="color">`, forma, orden) y generador de asientos con vista previa del conteo. Estados de solo lectura y bloqueos con el motivo visible ("Solo un admin edita recintos de la plataforma", "El recinto tiene entradas vendidas: zonas y asientos no se pueden modificar", "Lo usa un evento: no se puede borrar").
- No incluye:
  - Cambios en `event-form-service.ts`, `event-write-service.ts` ni en el formulario de evento: ya listan todos los recintos y sus zonas desde la DB, así que un recinto nuevo es seleccionable sin tocarlos (AC11 lo verifica).
  - Picker de mapa o geocodificación, `google_place_id`, zona horaria por recinto, subida de planos o imágenes.
  - Editor gráfico de formas, polígonos libres o `path` SVG a mano; alta/baja/edición de asientos individuales, bloqueo de asientos (`blocked`) o reubicación visual; sectores o puertas.
  - Baja lógica o archivado de recintos, duplicar recinto, transferir propiedad, auditoría de cambios.
  - Cambios en `proxy.ts`, en `relations.ts`, en el mapa público de compra, en el seed ni en `docs/architecture`.
  - Hook o caché de React Query: la lista y el detalle se leen en el servidor y, tras cada acción, se usa `router.refresh()` (patrón de `DeleteUserDialog`); no hay estado de cliente que invalidar.

## Reutilizar

- `requireRole`, `getCurrentUser` (`user/current-user.ts`); `can`, `hasRole` (`user.permissions.ts`); `UserRecord`.
- `eventHasSales` y `zoneOccupancy` (`event/services/event-facts-service.ts`) como definición de "vendida"; patrón de guardas en el `WHERE` y de `db.batch` de `event-write-service.ts`; `pgErrorCode` (`src/lib/pg-error.ts`); `insertInChunks` (patrón de `src/db/seed.ts`, no se importa: el insert de la grilla va en un solo statement ≤ 2000 filas).
- Patrón de `run()` + `safeParse` + `revalidatePath` de `event/actions.ts` y `user/actions.ts`; patrón de policy pura y schema con strings de `event.policy.ts` / `event-write.schema.ts`.
- `VENUE_VIEWBOX`, `VENUE_STAGE`, `DEFAULT_ZONE_COLOR`, `EMPTY_ZONE_SHAPE` (`booking/venue-map.utils.ts`) para el preview y la forma; se evaluó `VenueOverview.tsx` y se descarta: exige `VenueMap` con precios y estados de evento.
- `DeleteUserDialog` / `EditUserDialog` (patrón de diálogo con `useTransition`); `ConfirmDeleteDialog` queda en el módulo `venue` (un solo consumidor hoy, depende de `VenueActionResult`); si otro módulo lo necesita se mueve a `src/components`; `PanelShell`, `panel-nav.ts` (se agrega un ítem).
- UI ya instalada: `alert-dialog`, `button`, `input`, `select`, `form-field`, `badge`, `table`, `card`, `dialog`. No hace falta `shadcn add`.
- Next 16: `PageProps<"/organizer/venues/[id]">` con `params` async, como `src/app/(admin)/admin/users/page.tsx`; Server Actions en `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`.

## Archivos

Nuevos y modificados, un dueño por archivo:

- **T0**: `src/db/schema/venue.ts` (`createdBy`), `drizzle/0004_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0004_snapshot.json` (generados), `src/modules/user/user.permissions.ts` + `user.permissions.test.ts`, `src/modules/panel/panel-nav.ts` + `panel-nav.test.ts`.
- **T1**: `src/modules/venue/venue.types.ts`, `venue.schema.ts` + `.test.ts`, `venue.policy.ts` + `.test.ts`, `venue.utils.ts` + `.test.ts`.
- **T2**: `src/modules/venue/services/venue-facts-service.ts`, `venue-service.ts`, `venue-write-service.ts`, `src/modules/venue/actions.ts`.
- **T3**: `src/modules/venue/components/VenueForm.tsx`, `components/VenueList.tsx`, `components/ConfirmDeleteDialog.tsx`, `src/app/(admin)/organizer/venues/page.tsx`, `src/app/(admin)/organizer/venues/new/page.tsx`.
- **T4**: `src/modules/venue/components/VenueZonesEditor.tsx`, `ZoneForm.tsx`, `SeatGeneratorForm.tsx`, `ZoneMapPreview.tsx`, `src/app/(admin)/organizer/venues/[id]/page.tsx`.

Contratos entre tareas (los tipos viven en `venue.types.ts`, T1; `actions.ts` lo termina T2 y T3 y T4 lo importan):

- `VenueActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }`.
- `VenueCapabilities = { edit: boolean; delete: boolean; editZones: boolean }`; `ZoneCapabilities = { delete: boolean; changeType: boolean; generateSeats: boolean; minCapacity: number }`.
- Actions: `createVenueAction(input) → { id: string }`, `updateVenueAction({ id, ...values }) → void`, `deleteVenueAction({ id }) → void`, `createZoneAction({ venueId, ...zone }) → { id: string }`, `updateZoneAction({ id, ...zone }) → void`, `deleteZoneAction({ id }) → void`, `generateSeatsAction({ zoneId, ...generator }) → { count: number }`.
- `VenueForm({ venue?: { id: string; values: VenueFormValues }; readOnly?: boolean; reason?: string })`: sin `venue` crea y redirige a `/organizer/venues/[id]`; con `venue` edita.
- `ConfirmDeleteDialog({ open, title, description, confirmLabel, onClose, onConfirm: () => Promise<VenueActionResult>, onSuccess })`: muestra el error sin cerrar.
- `VenueZonesEditor({ venueId, zones: ZoneForEdit[], capabilities: VenueCapabilities, lockedReason?: string })`.
- Lecturas: `listVenues(actor) → VenueListRow[]`, `getVenueForEdit(actor, id) → VenueForEdit | undefined`.

## Criterios de aceptación

- AC1: la policy cumple la matriz: customer nada; organizer crea y edita/elimina solo recintos con `created_by` igual a su id; admin y super_admin cualquiera; recintos con `created_by = null` solo admin/super_admin; `created_by` nunca viene del input.
- AC2: `createVenueAction` guarda el recinto con `created_by` = usuario de sesión y devuelve su id; el nuevo recinto aparece en `/organizer/venues` como "Tuyo". Nombre, dirección y ciudad respetan sus largos; `lat`/`lng` fuera de rango o con solo uno de los dos dan error (mismos mensajes en el formulario en vivo y en el servidor).
- AC3: cualquier usuario `organizer` o superior ve todos los recintos (propios, de otros y del seed) en la lista y en el detalle de solo lectura; el botón Editar/Eliminar solo aparece según `capabilities`, y las actions rechazan lo no permitido aunque se invoquen directamente.
- AC4: una zona GA exige capacidad 1–100 000; una numerada ignora la capacidad (queda `null`); el color es `#RRGGBB`; el nombre no está vacío. La forma (rectángulo/elipse) genera `{ path, labelX, labelY, kind, x, y, width, height }` dentro de 800×540 y el mapa público de un evento de ese recinto la dibuja sin cambios en `booking`.
- AC5: generar asientos con (filas, asientos por fila, primera fila, número inicial) crea exactamente `filas × asientos` `venue_seat` con `row_label` consecutivo (`A…Z, AA…`), `seat_number` desde el inicial y `x/y` en grilla; reemplaza los anteriores en un solo batch; más de 2000 asientos, otro formato de fila o una zona GA se rechazan. Un recinto sembrado y uno creado generan el mismo patrón de coordenadas.
- AC6: con `hasSales` el servidor rechaza crear, editar, borrar zonas y generar asientos ("El recinto tiene entradas vendidas…"), y la UI muestra todo en solo lectura con el motivo; el nombre, la dirección, la ciudad y lat/lng siguen editables. "Vendida" usa `eventHasSales` (órdenes que no son `failed`/`cancelled`, o zonas con `sold`+`held` > 0).
- AC7: una zona `isReferenced` sin ventas no se puede borrar, cambiar de tipo ni regenerar; nombre, color, forma, orden y capacidad GA ≥ `minCapacity` sí se editan; bajar la capacidad por debajo de `minCapacity` da error. Una zona libre se borra, cambia de tipo (con las reglas de arriba) y regenera.
- AC8: eliminar un recinto sin eventos lo borra con sus zonas y asientos; con algún evento (de cualquier estado) no lo borra y responde "Lo usa un evento…"; la guarda va en el `WHERE` (`NOT EXISTS`), no solo en la policy. La UI no ofrece "Eliminar" cuando `isReferenced`.
- AC9: si una guarda cambia entre la lectura y la escritura (carrera con una compra o con un evento nuevo), el usuario ve "Las ventas cambiaron: recarga e intenta de nuevo" / "Lo usa un evento" y no queda un recinto con asientos que choquen con `event_seat`; el batch de asientos revierte entero ante `23503`.
- AC10: toda action (en `actions.ts`, T2) valida con zod, exige `requireRole("organizer")`, devuelve `{ ok, error }` con mensajes genéricos (detalle por `console.error`) y refresca `/organizer/venues`. Las páginas bajo `src/app` no contienen lógica de dominio: solo `requireRole`, la lectura del service y la composición de componentes.
- AC11: "Listo cuando": tras crear un recinto con una zona GA (capacidad ≥ 1) y otra numerada con asientos generados, `/organizer/events/new` lista ese recinto y sus dos zonas (con la capacidad esperada) y se puede crear un evento borrador con él; el recinto sin zonas utilizables sale marcado en `/organizer/venues` y no cambia el comportamiento de `getPublishBlockers`.
- AC12: "Recintos" aparece en el menú para `organizer`, `admin` y `super_admin`, no para `customer`, y queda activo en `/organizer/venues` y sus subrutas.
- AC13: migración `drizzle/0004_*.sql` generada con `npm run db:generate`; agrega solo `created_by` nullable con FK `on delete set null`; los recintos existentes no cambian.
- AC14: accesibilidad: diálogos con título, foco atrapado y cierre con Esc; campos con `FormField` y `aria-invalid`/`aria-describedby` al error o al motivo del bloqueo; targets ≥ 44 px; el preview del mapa tiene `role="img"` y `aria-label`; el color no es la única señal (cada zona lleva su nombre).
- AC15: `npm run lint`, `npx vitest run` y `npm run build` pasan.

## Tests requeridos

Vitest, junto al archivo. Los services con DB no se prueban con mocks de Drizzle (precedente del repo): la lógica de decisión vive en funciones puras.

- `user.permissions.test.ts`: `venue:manage-own` (organizer sí, customer no) y `venue:moderate` (admin sí, organizer no).
- `panel-nav.test.ts`: "Recintos" visible para organizer, admin y super_admin y no para customer; `getActiveHref` con `/organizer/venues/abc` devuelve `/organizer/venues`.
- `venue.policy.test.ts`: cada función × rol (`customer`, `organizer` dueño, `organizer` ajeno, `organizer` con recinto seed, `admin`, `super_admin`) × `isReferenced` × `hasSales`; `getZoneCapabilities`; `checkZoneChange` (cambio de tipo bloqueado, capacidad bajo `minCapacity`, capacidad igual o mayor permitida) (AC1, AC6, AC7, AC8).
- `venue.schema.test.ts`: `venueSchema` (largos, trim, lat/lng fuera de rango, solo uno de los dos, vacíos opcionales); `zoneSchema` (GA sin capacidad, capacidad `0`/`1.5`/`abc`, numerada que descarta capacidad, color inválido, forma fuera del viewBox, `width < 20`); `seatGeneratorSchema` (límites 1–50 / 1–100, producto > 2000, fila `a`/`AAA`/`1`, valores por defecto) (AC2, AC4, AC5).
- `venue.utils.test.ts`: `buildZoneShape` (rectángulo y elipse: `path` y centro de la etiqueta); `rowLabelAt` (`A`, `Z`→`AA`, desde `C`); `generateSeats` (cantidad, etiquetas, numeración inicial, grilla centrada con separación 28, sin duplicados de `(row, number)`, determinista); `summarizeVenue` (utilizable con GA ≥ 1, con numerada sin asientos no) (AC4, AC5, AC11).
- Verificación manual (services, actions y UI; AC2, AC6–AC9, AC11): crear recinto como organizador y como admin; editar un recinto ajeno y uno del seed como organizador (rechazado); recinto con orden simulada (bloqueo total de zonas y asientos); zona referenciada por un evento sin ventas; eliminar con y sin eventos; crear un evento con el recinto nuevo.

## Tareas

### T0 — Base compartida
- Archivos: `src/db/schema/venue.ts`, `drizzle/0004_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0004_snapshot.json`, `src/modules/user/user.permissions.ts`, `src/modules/user/user.permissions.test.ts`, `src/modules/panel/panel-nav.ts`, `src/modules/panel/panel-nav.test.ts`
- Depende de: —
- Paralelizable: no (todas las demás dependen de ella)
- Cubre: AC12, AC13 (más la base de AC1)

### T1 — Dominio puro (tipos, schemas, policy, utilidades)
- Archivos: `src/modules/venue/venue.types.ts`, `venue.schema.ts`, `venue.schema.test.ts`, `venue.policy.ts`, `venue.policy.test.ts`, `venue.utils.ts`, `venue.utils.test.ts`
- Depende de: T0
- Paralelizable: no (T2, T3 y T4 importan sus tipos y funciones)
- Cubre: AC1, AC2 (validación), AC4, AC5 (generador), AC6–AC8 (reglas puras)

### T2 — Servicios de lectura y escritura, y actions
- Archivos: `src/modules/venue/services/venue-facts-service.ts`, `venue-service.ts`, `venue-write-service.ts`, `src/modules/venue/actions.ts`
- Depende de: T1
- Paralelizable: no
- Cubre: AC2, AC3 (datos), AC5, AC6, AC7, AC8, AC9, AC10 (actions), AC11 (datos)

### T3 — Gestión de recintos (lista, alta, edición de datos básicos y baja)
- Archivos: `src/modules/venue/components/VenueForm.tsx`, `VenueList.tsx`, `ConfirmDeleteDialog.tsx`, `src/app/(admin)/organizer/venues/page.tsx`, `src/app/(admin)/organizer/venues/new/page.tsx`
- Depende de: T1, T2
- Paralelizable: no (T4 importa `VenueForm` y `ConfirmDeleteDialog` de esta tarea)
- Cubre: AC2, AC3, AC8 (UI), AC10 (páginas delgadas), AC11, AC14

### T4 — Editor de zonas, forma y generador de asientos
- Archivos: `src/modules/venue/components/VenueZonesEditor.tsx`, `ZoneForm.tsx`, `SeatGeneratorForm.tsx`, `ZoneMapPreview.tsx`, `src/app/(admin)/organizer/venues/[id]/page.tsx`
- Depende de: T3 (y, por transitividad, T1 y T2)
- Paralelizable: no (usa `VenueForm` y `ConfirmDeleteDialog` de T3 y las actions de T2)
- Cubre: AC4, AC5, AC6 (UI), AC7 (UI), AC9 (mensajes), AC10, AC14, AC15 (integración)

## Preguntas abiertas

1. **Permisos de edición (propuesta confirmada por la decisión humana, a validar los bordes).** Por defecto: admin y super_admin editan y eliminan todo; el organizador solo sus recintos; el seed solo admin. ¿Un organizador `pending`/`suspended` puede crear recintos? Por defecto sí (solo exige rol `organizer`, sin fila `organizer`), como los borradores de evento.
2. **Usar recintos ajenos o del seed en eventos.** Por defecto sí: todos son seleccionables, solo la edición es restringida. Consecuencia: un admin o el dueño que edita datos básicos (nombre, dirección, ciudad) cambia lo que ven los compradores de eventos de otros organizadores, incluso con ventas. ¿Se limita (p. ej. solo admin edita un recinto usado por eventos de otros)? Por defecto no.
3. **Qué cuenta como "entradas vendidas".** Por defecto, la misma definición del módulo de eventos (`eventHasSales`: orden que no es `failed`/`cancelled`, o zona con `sold`+`held` > 0): incluye lo reservado y queda en `true` aunque luego se reembolse. Alternativa más estricta con la card: solo órdenes `paid`/`partially_refunded` o `ticket` emitidos (permite editar mientras solo hay reservas). ¿Cuál?
4. **Alcance del bloqueo con ventas.** Por defecto, literal con la card: zonas y asientos 100 % solo lectura (incluye no agregar zonas) y datos básicos libres. Alternativa: permitir editar color, forma, nombre y orden aunque haya ventas (solo se bloquea capacidad, tipo, borrado y asientos). ¿Cuál?
5. **Zonas usadas por eventos sin ventas.** La spec agrega la regla "no se borra, no cambia de tipo, no regenera asientos, capacidad ≥ `minCapacity`" porque los FKs sin cascade y la copia de `event_seat` lo obligan; la card solo pide el bloqueo por ventas. ¿Se acepta, o se prefiere que el admin pueda forzar cambios (que implicaría reescribir `event_zone`/`event_seat`)?
6. **Eliminar recinto con eventos.** Por defecto bloqueado (hard delete solo sin eventos, de cualquier estado); sin baja lógica. ¿Se necesita "archivar" un recinto para ocultarlo del selector sin borrarlo? Quedaría para una fase posterior.
7. **Forma de la zona.** Por defecto: rectángulo o elipse con 5 números (x, y, ancho, alto, tipo), guardados con el `path` ya compatible con el mapa público. Las zonas del seed (curvas) no se pueden editar visualmente: se conservan o se reemplazan por una forma nueva. Alternativa: textarea con `path` SVG a mano (requiere `shadcn add textarea` y validar el `path`). ¿Se acepta el default?
8. **Generador de asientos.** Por defecto, reemplaza todos los asientos de la zona (no añade filas), máximo 2000 por generación, filas con letras (`A…Z, AA…`), grilla recta con separación 28 (sin la curva del seed). ¿Se necesitan filas numéricas, pasillos o "añadir filas" sin borrar? Hoy no.
9. **Lat/lng.** Por defecto, dos inputs numéricos (opcionales, ambos o ninguno); sin picker de mapa ni geocodificación (YAGNI). Hoy ninguna pantalla lee lat y lng; si luego hace falta, se agrega en otra fase.
10. **Duplicados.** No se impone unicidad de `(name, city)`. El seed (`ensureVenue`) busca por `(name, city)`: un recinto creado a mano con el mismo nombre y ciudad que uno del seed sería reutilizado por un re-seed. ¿Se valida el duplicado al crear? Por defecto no.
11. **Zona numerada sin asientos.** Se puede guardar (el recinto queda "Sin zonas utilizables" hasta generar asientos) y se puede elegir en un evento, que no se publicará mientras tanto. ¿Se prefiere ocultar del selector de evento los recintos sin zonas utilizables? Implicaría tocar `event-form-service.ts`; por defecto no.
12. **Discrepancias con `docs/architecture`** (manda la spec; esos docs no se modifican): (a) `erd.md §3` no incluye `venue.created_by`; (b) `system-design.md §6` ("Propiedad de `venue`") deja abierta la propiedad, resuelta aquí por la decisión humana (crea admin u organizador, con `created_by`); (c) `event-crud.md` excluyó el CRUD de recintos; esta spec lo cubre.
13. **Aplicar la migración.** `0004` agrega solo una columna nullable, pero hay que aplicarla (`npm run db:migrate`) en cada entorno antes de desplegar; hasta entonces, las consultas de esta spec fallan. Lo ejecuta el humano, no el developer.
14. **Ventana de concurrencia aceptada** por el driver `neon-http` (ver "Concurrencia"): una zona numerada sin asientos, usada por un evento en el mismo instante en que se generan sus asientos, podría quedar con `event_seat` incompletos. Si molesta, la salida es la misma que en la pregunta 1 de `event-crud.md` (driver con transacciones).

## Próximas fases

- Editor gráfico de formas y asientos (polígonos libres, arrastrar, pasillos, curvas) y mapa de asientos basado en `venue_seat.x/y` editables.
- Alta/baja/bloqueo de asientos individuales y filas con formato distinto.
- Picker de mapa y geocodificación (`lat/lng`, `google_place_id`).
- Archivar recintos; transferir propiedad; auditoría de cambios.
- Zona horaria por recinto (ver `event-crud.md`, pregunta 9).
- Reescribir `event_zone`/`event_seat` cuando un admin cambie la estructura de un recinto ya usado por eventos sin ventas.
