# Reserva temporal de entradas (10 min) con el mapa real

Estado: aprobada

## Objetivo

Hoy la selección de entradas vive solo en el navegador (`booking.store`, con `reservationExpiresAt` local) y nada se escribe en la DB: dos personas pueden "comprar" el mismo asiento. Esta spec (tarjeta Trello "05 · Reserva temporal de entradas (10 min) con el mapa real") hace que al pulsar "Continuar" en `/events/[slug]/tickets` el servidor cree una `reservation` `active` con `expires_at = now() + 10 min`, ponga los asientos en `held` y suba `held_count` de las zonas GA, de forma atómica y con las guardas de la DB. El mapa, el detalle, la landing y la búsqueda leen la disponibilidad ignorando las reservas vencidas, y el checkout toma el temporizador y el resumen de la reserva guardada.

**Listo cuando** un asiento reservado por un usuario aparece ocupado para otro.

Referencias (consultar solo estas secciones):

- `system-design.md §5.1`, paso 1: "reservation `active` con `expires_at = now + 10 min`; los asientos pasan a `held` y las zonas GA suben `held_count`".
- `system-design.md §5.2`: "las lecturas de disponibilidad ignoran reservas vencidas, así que no dependen del job para ser correctas".
- `system-design.md §3`, "Reglas de límite": los services no importan `next/*`; una Server Action solo valida (zod), autoriza y llama a un service.
- `erd.md §3`, grupo **Reserva**: `reservation (user_id, event_id, status, expires_at)` y `reservation_item (reservation_id, event_zone_id, event_seat_id null si GA, quantity)`.
- `erd.md §4`: guarda de asiento (`UPDATE … WHERE status='available'`), guarda GA (`held_count + n` con `sold_count + held_count + n <= capacity`, "el CHECK es la red de seguridad") y liberación.
- `erd.md §2`: `reservation_status` = `active | converted | expired | released`; `event_seat_status` = `available | held | sold | blocked` (`src/db/schema/enums.ts:31-42`).
- Specs aprobadas en las que se apoya:
  - `event-detail-real-data.md` (tarea 03): `getPublicEventDetail(slug)`, visible en público (`isPublic`), `getEventVenueMap`/`toVenueMap`, `Event.id` como identidad interna y `slug` como clave de URL.
  - `event-crud.md:23-24`: `hasSales` "incluye lo reservado (`held`) a propósito" y `hasOrders` cuenta cualquier fila de `reservation`.

### Hechos verificados (código instalado)

- **Driver**: `src/db/index.ts` usa `drizzle-orm/neon-http` (drizzle 0.45.3, `@neondatabase/serverless` 1.1.0). No hay transacciones interactivas (`neon-http/session.js:152`).
- **`db.batch` es UNA transacción no interactiva**: `NeonHttpSession.batch` (`node_modules/drizzle-orm/neon-http/session.js:117-133`) arma las sentencias y llama `this.client.transaction(builtQueries, …)`. Solo hace rollback si alguna sentencia **lanza**; un `UPDATE` que afecta 0 filas no lanza. Por eso el patrón `createBatch` (`src/modules/event/services/event-write-service.ts:121-146`), que revisa `rowCount` **después** del commit, no sirve aquí: dejaría el asiento 1 en `held` si el 2 ya estaba tomado.
- **`db.execute(sql\`…\`)`entra en un batch**: devuelve un`PgRaw` (`pg-core/db.js:273-287`) que implementa `RunnableQuery<_, "pg">`(=`BatchItem<"pg">`, `drizzle-orm/batch.d.ts`) y cuyo `_prepare()` devuelve el mismo objeto (`pg-core/query-builders/raw.js:22-23`).
- **Cómo llega el error del batch**: `batch` no pasa por `queryWithCache`, así que **no** lo envuelve en `DrizzleQueryError` (ese envoltorio está en `pg-core/session.js:41-98`, solo para consultas sueltas). Lanza directamente el `NeonDbError` del driver: ante un HTTP 400, `@neondatabase/serverless` copia `code` (SQLSTATE), `constraint`, `detail`, etc. del JSON (`index.mjs`, lista `severity…routine`; tipo en `index.d.mts:795-815`). `pgErrorCode` (`event-write-service.ts:81-89`) recorre `cause`, así que funciona en los dos casos.
- **Aislamiento**: `db.batch` no pasa `isolationLevel`, así que corre en el default de Postgres, `READ COMMITTED`. `now()` es el instante de inicio de la transacción, el mismo en todas las sentencias del batch.
- **`id` explícito**: `id` es `uuid().primaryKey().defaultRandom()` (`src/db/schema/columns.ts:3`) y admite un valor explícito. `$onUpdate` de `updated_at` (`columns.ts:12`) solo corre con el builder `.update().set()`, no con SQL crudo.
- **CHECK GA**: `event_zone_capacity_check` = `sold_count + held_count <= capacity` (`src/db/schema/event.ts:82-85`). Con `capacity` NULL la comparación da NULL y el CHECK **no** falla.
- **Límites**: `event_zone.max_per_order` default 10 (`event.ts:72`), que ningún código lee. El cliente usa `MAX_TICKETS_PER_ZONE = 6` (`booking.store.ts:8`).
- **Seed**: todos los `event_seat` nacen `available` y las GA con `sold_count = held_count = 0` (`src/db/seed.ts:142-166`). No hay holds huérfanos.
- **Auth**: `requireRole(minRole)` (`src/modules/user/current-user.ts:30-38`) hace `getCurrentUser()` (que ya hace `auth()` → `findUserByClerkId` + sync) y, sin sesión, `redirectToSignIn()` sin argumentos. En `@clerk/nextjs` 7.9.9, `redirectToSignIn` usa por defecto como `returnBackUrl` la URL del request (`ClerkUrl`, que pone el `clerkMiddleware` de `src/proxy.ts`): `node_modules/@clerk/nextjs/dist/esm/app-router/server/auth.js:58`. El resultado es `/sign-in?redirect_url=<URL actual>` (`NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` en `.env.example`; el parámetro es `redirect_url` en `@clerk/backend`). En una Server Action, la URL del request es la de la página que la invoca. `/my-tickets` ya usa este patrón (`src/app/(platform)/my-tickets/page.tsx:15`).
- **UI que bloquea zonas agotadas**: `VenueExplorer.tsx:41` no abre una zona `sold-out`; `PurchaseCard.tsx:17` y `EventDetailHero.tsx:24` ocultan "Comprar" si el evento está `sold-out`; `setQuantity` ignora zonas `sold-out` (`booking.store.ts:85`); `OrderSummary` solo tiene botón de quitar para asientos, no para líneas GA.
- **Next 16** (`node_modules/next/dist/docs/01-app/`, versión 16.3.6):
  - `03-api-reference/04-functions/redirect.md:12,31,51`: en una Server Action, `redirect` navega en el cliente (tipo `push` por defecto) y debe llamarse **fuera** del `try`. Fuera de una action, usa `replace`.
  - `03-api-reference/04-functions/use-router.md:46`: `router.refresh()` vuelve a pedir los Server Components de la ruta actual sin perder el estado del cliente (`useState`) ni el del navegador.
  - `03-api-reference/05-config/01-next-config-js/staleTimes.md:28`: el Client Cache de páginas dinámicas tiene 0 s por defecto. `next.config.ts` no activa `cacheComponents` ni `staleTimes`.

### Decisiones

Tomadas por el humano (no se reabren):

- **D1 — Driver `neon-http` sin cambios** (`src/db/index.ts` no se toca). Las guardas **abortan el batch lanzando un error de Postgres** (ver "Mecanismo de aborto"):
  - asientos: CTE con `UPDATE … RETURNING` y una división por cero si el conteo no coincide;
  - GA: la misma técnica, con el CHECK `event_zone_capacity_check` como red de seguridad.

  Los SQLSTATE `22012` (división por cero) y `23514` (CHECK) se traducen a "algunas entradas ya no están disponibles". Tras el rollback, una lectura informativa dice cuáles.

- **D2 — Reservas vencidas: barrer al reservar.** Dentro del mismo batch, antes de reservar, se expiran las reservas `active` vencidas **de ese evento**: pasan a `expired`, sus `event_seat` vuelven a `available` y baja `held_count` en las GA. Además, todas las lecturas de disponibilidad tratan como libre lo que retiene una reserva vencida (ver "Definiciones").
- **D3 — Re-reserva: reemplazar.** Si el usuario ya tiene una reserva `active` para el evento, se libera (`released`) en el mismo batch y se crea una nueva con 10 min nuevos. Si la nueva falla, el rollback deja intacta la anterior, con su mismo `expires_at`.

Derivadas en esta spec (con su justificación):

- **D4 — Sesión en las páginas, sin tocar `proxy.ts` ni `current-user.ts`** (opción a). `/tickets` y `/checkout` llaman `requireRole("customer")` después del `notFound()`. Por el default de Clerk (`auth.js:58`), el usuario vuelve a la misma página tras iniciar sesión. La action también llama `requireRole("customer")`, igual que `run()` en `src/modules/event/actions.ts:53`.
  - Se descarta (b), agregar `/events/*` al matcher de `proxy.ts`: no aporta nada sobre (a), y `auth.protect()` responde `unauthorized()` a una Server Action sin sesión (`@clerk/nextjs/dist/esm/server/protect.js:17-21`) en vez de redirigir.
  - Se descarta (c), "solo en la action": la tarjeta pide el retorno a la página de tickets, y el mapa necesita al usuario para mostrarle sus propios asientos (D6).
- **D5 — `expires_at` en el reloj de la DB**: `now() + make_interval(mins => 10)` en el `INSERT`, leído del `RETURNING` cuando termina el batch. El barrido, las lecturas y `getActiveReservation` comparan con `now()` de la DB, así que no hay desfase entre el reloj de la app y el de la DB.
- **D6 — El titular ve lo suyo como libre.** Las lecturas del mapa reciben `readerId`. Lo que retiene la reserva viva del propio lector no cuenta como ocupado, ni en el asiento ni en la ocupación de la zona. Es coherente con D3: al volver a reservar, esa reserva se reemplaza.
  - La ocupación de la zona también lo excluye. Si no, una zona cuyas últimas entradas tiene el propio usuario saldría `sold-out`, y `VenueExplorer.tsx:41` no la dejaría abrir.
- **D7 — Lecturas públicas "vivas".** `selectPublicZones` (landing, búsqueda, detalle) pasa a la ocupación viva sin lector.
  - Si no, un evento cuyas últimas entradas están en holds vencidos se vería "Agotado". Su CTA se oculta (`PurchaseCard.tsx:17`) y nadie llegaría a `/tickets` para disparar el barrido: quedaría trabado hasta la tarjeta 10. `system-design.md §5.2` pide que **las** lecturas no dependan del job.
  - La política del panel sigue con la ocupación cruda (ver "Definiciones → Quién usa qué").
- **D8 — Sin `revalidatePath` ni `refresh()` en la action.**
  - Tickets y checkout leen la sesión y `params`, la landing lee `searchParams` y la búsqueda también: todas se renderizan por request.
  - `cacheComponents` está apagado y el Client Cache dinámico es de 0 s (`staleTimes.md:28`). `router.push` al checkout trae datos frescos.
  - Tras un fallo, el cliente llama `router.refresh()`.
  - Otros usuarios ven los cambios al cargar o recargar (sin tiempo real; ver "Próximas fases").
- **D9 — `pgErrorCode` pasa a `src/lib/pg-error.ts`** (DRY). Hoy es privado en `event-write-service.ts:81-89`, y ese archivo importa `@/db` (`neon(process.env.DATABASE_URL!)`), así que un test de utils no puede importarlo. `event-write-service.ts` solo cambia la función local por el import; su comportamiento no cambia.
- **D10 — El store ya no guarda nada de la reserva.** El checkout lee la reserva de la DB, y la página le pasa `expiresAt` y las líneas a `CheckoutForm`. `ReservationTimer.tsx` no cambia: sigue recibiendo epoch ms (`Date.parse(expiresAt)`).

### Definiciones

- **Reserva viva**: `reservation.status = 'active' AND expires_at > now()`.
- **Reserva liberable para un lector** (`readerId: string | null`): `status = 'active' AND (expires_at <= now() OR user_id = readerId)`. Con `readerId = null` solo cuentan las vencidas.
  - Es exactamente el conjunto que el barrido + reemplazo (S1) libera cuando `readerId` reserva. Por eso lectura y escritura coinciden.
  - Se define **una vez**, como fragmento SQL `releasableReservation(readerId)` en `event-facts-service.ts`, y lo usan el barrido, el mapa, las lecturas públicas y la lectura informativa.
- **Estado efectivo de un asiento para un lector**: un `event_seat` en `held` con un `reservation_item` de una reserva liberable para el lector cuenta como `available`; si no, vale su `status` tal cual. Fragmento `effectiveSeatStatus(readerId)`.
  - `toVenueMap` sigue igual: `available` → `"available"`; `held`, `sold` y `blocked` → `"occupied"`.
- **Ocupación viva de una zona para un lector**, fragmento `liveZoneOccupancy(readerId = null)`, correlacionado con `event_zone` ⨝ `venue_zone` igual que `zoneOccupancy`:
  - GA: `sold_count + held_count − coalesce(Σ reservation_item.quantity, 0)`, sumando los ítems GA (`event_seat_id IS NULL`) de la zona que pertenecen a reservas liberables para el lector.
  - Numerada: cantidad de asientos de la zona con estado efectivo `sold` o `held`.
  - `blocked` no suma, igual que hoy.
  - La capacidad no cambia: `zoneCapacity`, donde una GA con `capacity` NULL vale 0.
- **Quién usa qué**:

  | Lectura / escritura                                                                                               | Fragmento                                                                                                                                                                                                                                |
  | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `selectPublicZones` (landing, búsqueda, detalle, `PurchaseCard`)                                                  | `liveZoneOccupancy()` (sin lector)                                                                                                                                                                                                       |
  | `getEventVenueMap(event, readerId)`: detalle con `null`, tickets con `user.id`                                    | `liveZoneOccupancy(readerId)` y `effectiveSeatStatus(readerId)`                                                                                                                                                                          |
  | Barrido + reemplazo (S1)                                                                                          | `releasableReservation(userId)`                                                                                                                                                                                                          |
  | Lectura informativa tras un fallo                                                                                 | `effectiveSeatStatus(userId)`, `zoneCapacity − liveZoneOccupancy(userId)`                                                                                                                                                                |
  | Política del panel: `getZoneStates`, `getZoneStatesByEvent`, `eventHasSales`, guardas de `event-write-service.ts` | **sin cambios**: `zoneOccupancy`, `gaOccupancy` y `seatedOccupancy` crudos. Cuentan `held` a propósito (`event-crud.md:23`); además, una guarda de capacidad sobre la ocupación viva haría saltar el CHECK, que ve el `held_count` crudo |

- **Tablas sin alias dentro de los fragmentos.** Drizzle renderiza `${reservation.status}` como `"reservation"."status"` y `${eventSeat.id}` como `"event_seat"."id"`, y Postgres no deja nombrar por su nombre original una tabla con alias. Por eso, donde se usen `releasableReservation`, `effectiveSeatStatus` o `liveZoneOccupancy`, las tablas `reservation`, `event_seat` y `event_zone` van **sin alias**:
  - el `exists (select 1 from reservation_item join reservation …)` de `effectiveSeatStatus`;
  - el `count(*) from event_seat` de la rama numerada;
  - el `UPDATE reservation` de S1;
  - la lectura informativa.

  `reservation_item` sí admite alias (p. ej. `ri`), porque ningún fragmento compartido la nombra. Con `join reservation r`, la consulta falla en ejecución con "missing FROM-clause entry".

- **Límite por zona**: `MAX_TICKETS_PER_ZONE = 6`, como máximo de asientos por zona numerada y de cantidad por zona GA.
  - Se define en `reservation.schema.ts` y `booking.store.ts` lo re-exporta, así que `GeneralAdmissionPanel.tsx`, `VenueExplorer.tsx` y el test del store no cambian sus imports.
  - `event_zone.max_per_order` no se lee (Pregunta 4).
- **Contrato de cable** (`src/modules/booking/reservation.types.ts`). Las fechas viajan como **string ISO 8601 UTC** (`Date#toISOString()`), nunca como `Date`:

  ```ts
  export interface SeatRequest {
    eventZoneId: string;
    seatIds: string[];
  }
  export interface GeneralAdmissionRequest {
    eventZoneId: string;
    quantity: number;
  }
  export interface TicketRequest {
    seats: SeatRequest[];
    generalAdmission: GeneralAdmissionRequest[];
  }
  /** Action input: the event by its public slug plus what to hold. */
  export interface ReserveTicketsInput extends TicketRequest {
    slug: string;
  }
  /** Found unavailable after a failed hold. `zoneIds`: GA zones with no live remaining. */
  export interface UnavailableTickets {
    seatIds: string[];
    zoneIds: string[];
  }
  export type ReserveTicketsResult =
    | { ok: true; data: { reservationId: string; expiresAt: string } }
    | { ok: false; error: string; unavailable?: UnavailableTickets };
  /** The user's live reservation for an event, as the checkout shows it. */
  export interface ActiveReservation {
    id: string;
    expiresAt: string;
    lines: OrderLine[];
  }
  ```

  Más los tipos de fila de los mapeos puros (sus campos los decide T1):
  - `NewReservationItem`: `reservationId`, `eventZoneId`, `eventSeatId: string | null`, `quantity`.
  - `SeatAvailabilityRow`: `id`, `eventZoneId`, `free: boolean`.
  - `ZoneAvailabilityRow`: `id`, `remaining: number`.
  - `ReservationItemRow`: `eventZoneId`, `zoneName`, `priceCents`, `quantity`, y `eventSeatId`, `rowLabel`, `seatNumber`, `x`, `y`, todos nulos en GA.

- **Mensajes** (`RESERVATION_MESSAGES` en `reservation.utils.ts`):
  - `invalid`: "Datos inválidos.";
  - `eventUnavailable`: "Este evento ya no está disponible.";
  - `unavailable`: "Algunas entradas que elegiste ya no están disponibles. Actualizamos el mapa: revisa tu selección e intenta de nuevo.";
  - `generic`: "No pudimos reservar tus entradas. Intenta de nuevo.".
- **Contrato de `booking.store`** (se fija aquí para que T4 no dependa de decisiones de otras tareas):
  - Estado: `eventId`, `activeZoneId`, `seats`, `quantities`, `lastOrder` y `orders`. **Se eliminan** `reservationExpiresAt`, `startReservation` y `RESERVATION_MS`.
  - `EMPTY_SELECTION = { activeZoneId: null, seats: {}, quantities: {} }`.
  - Nuevo `pruneSelection({ seatIds, zoneIds }: UnavailableTickets)`: quita esos asientos de cualquier zona y borra las cantidades de esas zonas GA. No mira `zone.status`, a diferencia de `setQuantity`.
  - `confirmOrder(input: ConfirmOrderInput, orderId?)`, con `ConfirmOrderInput = { eventId: string; lines: OrderLine[]; currency: string; method: PaymentMethod; buyerName: string; email: string }`:
    - el pedido usa `input.eventId` y `input.lines` (las de la reserva), y los totales salen de `getOrderTotals(lines)`;
    - como hoy, limpia la selección y conserva `eventId`/`activeZoneId`.
  - Se mantienen `init`, `setActiveZone`, `toggleSeat`, `removeSeat`, `setQuantity`, `reset`, `getOrderLines`, `getOrderTotals` y `createOrderId`.
  - `partialize` = `{ eventId, activeZoneId, seats, quantities, lastOrder, orders }`.
  - **Sin `version`/`migrate`.** Un `reservationExpiresAt` que quede en localStorage se mezcla en memoria y nadie lo lee. `partialize` lo descarta en la siguiente escritura. Subir `version` sin `migrate` haría que zustand 5.0.15 descartara el estado guardado, incluidos los `orders` de "Mis entradas".

### Mecanismo de aborto (una sola llamada `db.batch`, en este orden)

Las sentencias se ejecutan en orden dentro de una transacción, y cada una ve los efectos de las anteriores. Dentro de **una** sentencia, en cambio, las CTE no ven los efectos de las otras, y no se puede actualizar dos veces la misma fila. En SQL crudo se fija `updated_at = now()` a mano.

1. **S1, barrido + reemplazo** (siempre; `db.execute`):

   ```sql
   with freed as (
     update reservation
        set status = (case when expires_at <= now() then 'expired' else 'released' end)::reservation_status,
            updated_at = now()
      where event_id = $eventId and <releasableReservation($userId)>
     returning id
   ),
   items as (
     select ri.event_zone_id, ri.event_seat_id, ri.quantity
       from reservation_item ri join freed on freed.id = ri.reservation_id
   ),
   seats as (
     update event_seat set status = 'available', updated_at = now()
      where id in (select event_seat_id from items where event_seat_id is not null) and status = 'held'
     returning id
   ),
   zones as (
     update event_zone set held_count = event_zone.held_count - released.quantity, updated_at = now()
       from (select event_zone_id, sum(quantity)::int as quantity
               from items where event_seat_id is null group by event_zone_id) released
      where event_zone.id = released.event_zone_id
     returning event_zone.id
   )
   select count(*)::int as released from freed
   ```

   - **El conjunto liberado sale del `UPDATE reservation … RETURNING`, nunca de un `SELECT` previo.** Un `SELECT` solo ve su snapshot: dos reservas concurrentes del mismo evento verían la misma reserva vencida y las dos bajarían `held_count` (doble descuento). Con el `UPDATE`, en `READ COMMITTED` la segunda transacción espera el lock de la fila, vuelve a evaluar `status = 'active'` sobre la versión ya confirmada y la excluye.
   - `held_count` baja **una sola vez por zona** (agregado con `GROUP BY`). El barrido de otros y el reemplazo propio caen en la misma sentencia y pueden tocar la misma zona.
   - El `case` necesita el cast a `reservation_status`: sin él, el resultado es `text`.

2. **S2, guarda de asientos** (solo si `seats` no está vacío; `db.execute`):

   ```sql
   with held as (
     update event_seat set status = 'held', updated_at = now()
      where (id, event_zone_id) in (($seat1::uuid, $zone1::uuid), …)
        and status = 'available'
        and event_zone_id in (select id from event_zone where event_id = $eventId)
     returning id
   )
   select 1 / (count(*) = $seatCount)::int as ok from held
   ```

   - Si algún asiento no está `available` (después del barrido), no es de esa zona o no es de ese evento, `count(*) < $seatCount` → `1 / 0` → **SQLSTATE 22012** → rollback de todo el batch.
   - La expresión **no es constante**: `count(*)` es un agregado y se evalúa al ejecutar. No usar `CASE … ELSE 1/0 END`, porque el planner puede plegar `1/0` y fallar aunque el conteo coincida.
   - Con concurrencia, la segunda transacción espera el lock del asiento y vuelve a evaluar `status = 'available'` sobre la fila confirmada: queda excluido.
   - El par `(asiento, zona)` impide que un cliente manipulado registre un asiento con el precio de otra zona.

3. **S3, guarda GA** (una sentencia por cada `generalAdmission[i]`; `db.execute`):

   ```sql
   with held as (
     update event_zone set held_count = held_count + $quantity, updated_at = now()
      where id = $eventZoneId and event_id = $eventId
        and venue_zone_id in (select id from venue_zone where seating_type = 'general_admission')
        and sold_count + held_count + $quantity <= coalesce(capacity, 0)
     returning id
   )
   select 1 / (count(*) = 1)::int as ok from held
   ```

   - Sin cupo, si la zona no es del evento o no es GA, o si `capacity` es NULL → 0 filas → **22012**.
   - Si aun así se violara el invariante, el CHECK lanza **23514**.
   - `coalesce(capacity, 0)` hace que una GA sin capacidad no se pueda vender: es coherente con `zoneCapacity`, que ya la muestra `sold-out`, y cubre el hueco del CHECK con NULL (Pregunta 7).

4. **S4, reserva** (builder):

   ```ts
   db.insert(reservation)
     .values({
       id: reservationId,
       userId,
       eventId,
       expiresAt: sql`now() + make_interval(mins => ${RESERVATION_MINUTES})`,
     })
     .returning({ id: reservation.id, expiresAt: reservation.expiresAt });
   ```

   - `reservationId = crypto.randomUUID()` se genera en la app, porque una sentencia del batch no puede leer el `RETURNING` de otra.
   - `status` toma el default `active`.
   - El índice de S4 dentro del arreglo se guarda al armar el batch, para leer `{ id, expiresAt }` del resultado.

5. **S5, ítems** (builder): `db.insert(reservationItem).values(toReservationItems(reservationId, request))`. Va después de S4 por la FK.

**Qué lanza y qué devuelve** (`reserveTickets` en `reservation-service.ts`):

- Batch OK → `{ ok: true, data: { reservationId, expiresAt: expiresAt.toISOString() } }`.
- `isUnavailableError(error)`, es decir `pgErrorCode(error)` ∈ {`22012`, `23514`}:
  - todo quedó como antes: también se deshacen el barrido y el reemplazo, así que la reserva anterior del usuario sigue viva;
  - se hace una **lectura informativa** fuera de la transacción, con los fragmentos vivos para `userId`:
    - asientos pedidos: `id`, `event_zone_id` y `free = effectiveSeatStatus(userId) = 'available'`, de las zonas del evento;
    - zonas GA pedidas: `remaining = zoneCapacity − liveZoneOccupancy(userId)`, de zonas GA del evento;
  - devuelve `{ ok: false, error: RESERVATION_MESSAGES.unavailable, unavailable: findUnavailable(request, seatRows, zoneRows) }`.
  - La lectura es de mejor esfuerzo: si la carrera ya se resolvió, puede devolver listas vacías, y el mensaje y el refresh siguen valiendo.
  - Con la DB tal cual quedó tras el rollback, un `status <> 'available'` crudo listaría como no disponibles asientos de reservas vencidas. Por eso **debe** usar `effectiveSeatStatus`.
- Cualquier otro error, incluidos `40P01` (deadlock entre dos reservas que bloquean filas en distinto orden; Postgres aborta una) y errores de red: se relanza. La action lo registra con `console.error` y responde `RESERVATION_MESSAGES.generic`. No hay reintento automático.

Que el SQL de las guardas sea correcto **no lo cubre ningún unit test**: se verifica con los criterios manuales AC1–AC6 (dos usuarios, dos navegadores) y las consultas de AC11.

## Alcance

- Incluye:
  - **Núcleo puro de la reserva** (`src/modules/booking`):
    - `reservation.types.ts`: los tipos del contrato de cable y los de fila.
    - `reservation.schema.ts`:
      - exporta `MAX_TICKETS_PER_ZONE = 6` y `reserveTicketsSchema`;
      - `slug`: `z.string().min(1)`. Su formato lo valida `getPublicEventDetail`/`isEventSlug`;
      - `seats[]`: `{ eventZoneId: z.uuid(), seatIds: z.array(z.uuid()).min(1).max(MAX) }`;
      - `generalAdmission[]`: `{ eventZoneId: z.uuid(), quantity: z.int().min(1).max(MAX) }`;
      - los dos arreglos son obligatorios y pueden ir vacíos;
      - refinamientos: al menos una entrada en total; ningún `eventZoneId` repetido, ni dentro de una lista ni entre las dos; ningún `seatId` repetido;
      - las claves desconocidas se descartan;
      - la salida es asignable a `ReserveTicketsInput`.
    - `reservation.utils.ts`:
      - `RESERVATION_MINUTES = 10` y `RESERVATION_MESSAGES`;
      - `isUnavailableError(error)`;
      - `toReserveInput(slug, lines: OrderLine[])`: una línea con `seats.length > 0` → `seats` con sus ids; sin asientos → `generalAdmission` con `quantity`. Conserva el orden de las líneas;
      - `toReservationItems(reservationId, request)`: asientos → `quantity: 1` con su `eventSeatId`; GA → `eventSeatId: null` con `quantity`;
      - `findUnavailable(request, seatRows, zoneRows)`:
        - asiento sin fila, con otra zona o con `free: false` → `seatIds`;
        - zona GA sin fila o con `remaining <= 0` → `zoneIds`;
        - una GA con `remaining > 0` pero menor a lo pedido **no** se incluye: sigue abierta y el usuario ajusta;
        - mantiene el orden del pedido;
      - `toActiveReservation({ id, expiresAt: Date }, items: ReservationItemRow[])`:
        - `expiresAt` en ISO;
        - una línea por zona, en el orden de aparición de las filas;
        - `quantity` es la suma de cantidades;
        - `amount = (quantity × priceCents) / 100`;
        - asientos ordenados por fila (orden natural, `localeCompare(…, { numeric: true })`) y número, con `x`/`y` nulos → 0 y `status: "available"`.
  - **`src/lib/pg-error.ts`**: `pgErrorCode(error: unknown): string | undefined`, movida tal cual desde `event-write-service.ts:81-89`, que pasa a importarla (D9).
  - **Lecturas vivas**:
    - `event-facts-service.ts` agrega y exporta `releasableReservation(readerId)`, `effectiveSeatStatus(readerId)` y `liveZoneOccupancy(readerId = null)`, con la semántica de "Definiciones". Cuando `readerId` es `null`, se omite la condición `user_id = …`. Los fragmentos actuales no cambian.
    - `event-public-service.ts`: `selectPublicZones` usa `liveZoneOccupancy()` en lugar de `zoneOccupancy`. No cambia nada más.
    - `venue-map-service.ts`: `getEventVenueMap(event, readerId: string | null = null)`.
      - Las zonas usan `occupied: liveZoneOccupancy(readerId)`; `capacity` sigue con `zoneCapacity`.
      - Los asientos usan `status: effectiveSeatStatus(readerId)`, con el mismo tipo enum, así que `VenueSeatRow`, `toVenueMap` y `venue-map.utils.ts` no cambian.
      - Se tipa con `sql<VenueSeatRow["status"]>`. No se exporta el alias local `EventSeatStatus` de `venue-map.utils.ts`, porque ese archivo no cambia (AC14).
      - El parámetro es opcional: el detalle `/events/[slug]` sigue llamando `getEventVenueMap(event)` sin cambios.
  - **Servicio y action**:
    - `services/reservation-service.ts`:
      - `reserveTickets(userId, eventId, request: TicketRequest): Promise<ReserveTicketsResult>`, con el batch de "Mecanismo de aborto", el mapeo de errores y la lectura informativa;
      - `getActiveReservation(userId, eventId): Promise<ActiveReservation | null>`:
        - lee la reserva viva más reciente del usuario para el evento (`status='active' AND expires_at > now()`);
        - lee sus ítems: `reservation_item` ⨝ `event_zone` ⨝ `venue_zone`, `LEFT JOIN event_seat ⨝ venue_seat`, ordenados por `venue_zone.sort_order, venue_zone.name, event_zone.id`;
        - mapea con `toActiveReservation`. Sin reserva viva devuelve `null`;
      - no importa `next/*`.
    - `src/modules/booking/actions.ts` (`"use server"`) exporta `reserveTicketsAction(input: unknown): Promise<ReserveTicketsResult>`:
      1. `const user = await requireRole("customer")`, fuera del `try`;
      2. `reserveTicketsSchema.safeParse(input)`; si falla → `RESERVATION_MESSAGES.invalid`;
      3. dentro de `try`: `getPublicEventDetail(slug)`; sin evento → `eventUnavailable`. Si existe → `reserveTickets(user.id, event.id, { seats, generalAdmission })`;
      4. en el `catch`: `console.error("reserveTicketsAction", error)` → `generic`;
      5. no llama `revalidatePath` ni `refresh` (D8).
  - **Store y UI** (`src/modules/booking`):
    - `booking.store.ts` con el contrato de "Definiciones", y `booking.store.test.ts` actualizado.
    - `OrderSummary.tsx`:
      - pierde `checkoutHref` y gana `onContinue: () => void`, `isPending: boolean` y `error: string | null`;
      - "Continuar" pasa a ser un `Button` (`variant="cta"`), deshabilitado si no hay entradas o si `isPending`. Mientras corre, dice "Reservando…";
      - el `error` se muestra con `role="alert"` en la tarjeta y en la barra fija de móvil.
    - `TicketSelection.tsx`, al pulsar "Continuar":
      - llama `reserveTicketsAction(toReserveInput(event.slug, lines))` con un estado pendiente (p. ej. `useTransition`);
      - `ok` → `router.push(\`/events/${event.slug}/checkout\`)`. La selección queda en el store, así que al volver se ve tal cual y "Continuar" reemplaza (D3);
      - `!ok` → muestra `error`, llama `pruneSelection(unavailable)` si viene y hace `router.refresh()` para traer el mapa nuevo. El estado del cliente se conserva (`use-router.md:46`).
      - El resto no cambia: `init(event.id)` y la selección mientras se elige.
    - `CheckoutForm.tsx`:
      - props `{ event: CheckoutEvent; reservation: ActiveReservation }`; desaparece `zones`;
      - las líneas y los totales salen de `reservation.lines`;
      - `<ReservationTimer expiresAt={Date.parse(reservation.expiresAt)} onExpire={handleExpire} />`;
      - `handleExpire` solo muestra el `EmptyState` "Tu reserva expiró": **no** llama `reset()` y la selección del store se conserva (Pregunta 3);
      - se eliminan el efecto `startReservation`, `isCurrent` y el estado vacío "Todavía no elegiste entradas", que deja de ser alcanzable;
      - se mantiene el `hydrated` de `usePersistHydration`: `confirmOrder` escribe en el store, y así el temporizador no se renderiza en el servidor;
      - al pagar: `confirmOrder({ eventId: event.id, lines: reservation.lines, currency, method, buyerName, email })` → `/events/[slug]/confirmation`, como hoy.
  - **Rutas** (solo componen):
    - `tickets/page.tsx`: `getPublicEventDetail` → `notFound()` → `requireRole("customer")` → `getEventVenueMap(event, user.id)` → `TicketSelection`. `generateMetadata` no cambia.
    - `checkout/page.tsx`: `getPublicEventDetail` → `notFound()` → `requireRole("customer")` → `getActiveReservation(user.id, event.id)`.
      - Sin reserva → `redirect(\`/events/${event.slug}/tickets\`)`, que fuera de una action usa `replace` (`redirect.md:31`).
      - Con reserva → `<CheckoutForm event={event} reservation={reservation} />`.
      - Ya no llama `getEventVenueMap`.
- No incluye:
  - Orden, pago real, `orders`/`payment` y la conversión de la reserva (tarjeta 07). Después del pago simulado, la reserva sigue `active` hasta vencer.
  - Job `/api/jobs/release-holds` (tarjeta 10).
  - `max_per_order`, el tope del selector GA por disponibilidad restante y la actualización en tiempo real.
  - Cambios en `src/db/schema/*`, migraciones, `src/db/index.ts`, `src/proxy.ts`, `src/modules/user/current-user.ts`, `next.config.ts` o `docs/architecture/*`.
  - Componentes que **no** cambian, con el motivo:
    - `ReservationTimer.tsx`: sigue recibiendo epoch ms;
    - `SeatMap.tsx`: se guía por `seat.status`;
    - `GeneralAdmissionPanel.tsx` y `VenueExplorer.tsx`: importan `MAX_TICKETS_PER_ZONE` del store, que lo re-exporta;
    - `CheckoutSummary.tsx`: ya recibe `lines`;
    - `OrderConfirmation.tsx`: compara `order.eventId` con `event.id`;
    - `MyTickets.tsx`, `VenueOverview.tsx`, `ZoneLegend.tsx` y la página de detalle y la de confirmación.
  - `venue-service.ts` (mock): queda intacto, porque lo usa `src/db/seed-data.ts:2`.
  - Cambiar la política del panel (`getZoneStates`, `eventHasSales` y las guardas de escritura siguen crudas).

## Reutilizar

- `getPublicEventDetail(slug)` (`event-public-service.ts`): visibilidad pública y guarda de formato del slug, para la action y las dos páginas.
- `requireRole`/`getCurrentUser` (`src/modules/user/current-user.ts`): sesión → usuario de la DB, con el retorno por defecto a la URL actual. No se agrega otra llamada a `findUserByClerkId`.
- `getEventVenueMap`/`toVenueMap` (`venue-map-service.ts`, `venue-map.utils.ts`): se extiende el service con `readerId`; los utils no cambian.
- `zoneCapacity` y `zoneOccupancy`/`gaOccupancy`/`seatedOccupancy` (`event-facts-service.ts`): los nuevos fragmentos viven junto a ellos y los crudos no cambian.
- `pgErrorCode` (se mueve a `src/lib/pg-error.ts`). No se reutiliza `createBatch`, porque revisa `rowCount` después del commit (ver "Hechos verificados").
- Tablas `reservation`/`reservationItem` (`src/db/schema/reservation.ts`) y sus índices (`reservation_event_id_idx`, `reservation_item_event_seat_id_idx`, `reservation_item_event_zone_id_idx`), y `event_seat_zone_status_idx`.
- `getOrderLines`, `getOrderTotals`, `OrderLine`, `Seat` y `PaymentMethod`.
- `ReservationTimer`, `CheckoutSummary`/`CheckoutEventHeader`, el `EmptyState` interno de `CheckoutForm` y `CheckoutHeader`.
- UI: `Button`/`buttonVariants` (`src/components/ui/button.tsx`). No hace falta `npx shadcn add`, así que no hay T0.

## Archivos

| Archivo                                               | Cambio                                                                                                                          | Tarea |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `src/lib/pg-error.ts`                                 | nuevo: `pgErrorCode` (movida)                                                                                                   | T1    |
| `src/lib/pg-error.test.ts`                            | nuevo                                                                                                                           | T1    |
| `src/modules/event/services/event-write-service.ts`   | solo: borra `pgErrorCode` local e importa la de `@/lib/pg-error`                                                                | T1    |
| `src/modules/booking/reservation.types.ts`            | nuevo: contrato de cable y tipos de fila                                                                                        | T1    |
| `src/modules/booking/reservation.schema.ts`           | nuevo: `MAX_TICKETS_PER_ZONE`, `reserveTicketsSchema`                                                                           | T1    |
| `src/modules/booking/reservation.schema.test.ts`      | nuevo                                                                                                                           | T1    |
| `src/modules/booking/reservation.utils.ts`            | nuevo: constantes, mensajes y mapeos puros                                                                                      | T1    |
| `src/modules/booking/reservation.utils.test.ts`       | nuevo                                                                                                                           | T1    |
| `src/modules/event/services/event-facts-service.ts`   | + `releasableReservation`, `effectiveSeatStatus`, `liveZoneOccupancy`                                                           | T2    |
| `src/modules/event/services/event-public-service.ts`  | `selectPublicZones` con `liveZoneOccupancy()`                                                                                   | T2    |
| `src/modules/booking/services/venue-map-service.ts`   | `readerId` opcional; zonas y asientos con los fragmentos vivos                                                                  | T2    |
| `src/modules/booking/services/reservation-service.ts` | nuevo: `reserveTickets`, `getActiveReservation`                                                                                 | T3    |
| `src/modules/booking/actions.ts`                      | nuevo: `reserveTicketsAction`                                                                                                   | T3    |
| `src/modules/booking/booking.store.ts`                | contrato nuevo (sin reserva local, `pruneSelection`, `confirmOrder` con `lines`/`eventId`, re-export de `MAX_TICKETS_PER_ZONE`) | T4    |
| `src/modules/booking/booking.store.test.ts`           | actualizado                                                                                                                     | T4    |
| `src/modules/booking/components/OrderSummary.tsx`     | "Continuar" pasa a botón con `onContinue`/`isPending`/`error`                                                                   | T4    |
| `src/modules/booking/components/TicketSelection.tsx`  | llama la action; éxito → checkout; fallo → error, poda y `router.refresh()`                                                     | T4    |
| `src/modules/booking/components/CheckoutForm.tsx`     | props `reservation`; temporizador y líneas de la reserva                                                                        | T4    |
| `src/app/(platform)/events/[slug]/tickets/page.tsx`   | `requireRole("customer")`; `getEventVenueMap(event, user.id)`                                                                   | T4    |
| `src/app/(platform)/events/[slug]/checkout/page.tsx`  | `requireRole("customer")`; `getActiveReservation` o `redirect` a tickets                                                        | T4    |

## Criterios de aceptación

Los manuales usan dos usuarios distintos de Clerk en dos navegadores (p. ej. uno normal y otro en incógnito) y la DB sembrada.

- AC1 (de la tarjeta): A reserva el asiento X ("Continuar" → llega al checkout). B carga o recarga `/events/<slug>/tickets` y ve X ocupado: no lo puede seleccionar y su leyenda dice "ocupado".
- AC2 (atomicidad): B selecciona X (retenido por A) y además Y (libre), y pulsa "Continuar".
  - B ve el mensaje `unavailable`, X desaparece de su selección, Y sigue seleccionado y el mapa se refresca.
  - En la DB, Y sigue `available` y B no tiene ninguna `reservation` nueva.
- AC3 (concurrencia): A y B eligen el mismo asiento libre y pulsan "Continuar" casi a la vez.
  - Exactamente uno llega al checkout; el otro recibe `unavailable` (o `generic` si hubo deadlock) y no queda con nada retenido.
  - El asiento aparece en un solo `reservation_item` de una reserva `active`.
- AC4 (GA):
  - Con una zona GA en `sold_count + held_count = capacity − 1`, A reserva 1 → OK. B pide 1 → `unavailable`, la cantidad de esa zona se borra de su selección (la zona queda `sold-out`) y `held_count` nunca supera `capacity`.
  - Si quedan 2 y B pide 4: `unavailable`, pero su cantidad **no** se borra (la zona sigue abierta).
  - Una GA con `capacity` NULL se ve `sold-out`, y una petición manipulada para ella recibe `unavailable`.
- AC5 (vencidas):
  - Con la reserva de A vencida a mano (`update reservation set expires_at = now() - interval '1 minute' where id = …`), **sin ninguna escritura más**:
    - en `/tickets` de B, los asientos de A se ven libres;
    - las zonas de A dejan de verse `sold-out`/`last-tickets` por esa reserva en el mapa, el detalle, la landing y `/events`.
  - Cuando B reserva cualquier entrada de ese evento:
    - la reserva de A pasa a `expired`;
    - sus asientos quedan `available`, o `held` por B si B los tomó;
    - `held_count` baja en la cantidad GA de A;
    - las reservas vencidas de **otros** eventos no se tocan.
- AC6 (reemplazo):
  - A, con una reserva viva R1 (X), vuelve a `/tickets`, cambia X por Y y pulsa "Continuar":
    - R1 queda `released` y X `available`;
    - hay una R2 `active` con Y y un `expires_at` nuevo (≈ `now() + 10 min`);
    - A no tiene dos reservas `active` para el evento.
  - Si la nueva falla (Y tomado por B), R1 sigue `active` con X `held` y el mismo `expires_at`.
- AC7 (lo propio, D6): A vuelve a `/tickets` con su reserva viva.
  - Sus asientos se ven libres y seleccionados (su selección sigue en el store), y su cantidad GA no hace que la zona se vea `sold-out`.
  - B los ve ocupados.
- AC8 (sesión):
  - Sin sesión, `/events/<slug>/tickets` y `/events/<slug>/checkout` llevan a `/sign-in?redirect_url=…` y, tras iniciar sesión, vuelven a esa misma página.
  - Un slug inválido o un evento no visible da 404 sin pedir sesión, porque `notFound()` va antes de `requireRole`.
  - La action sin sesión redirige a `/sign-in` y no escribe nada.
- AC9 (checkout):
  - Con una reserva viva:
    - el resumen (zonas, cantidades, asientos e importes) sale de la reserva;
    - el temporizador cuenta hasta `expires_at`: al recargar, sigue el tiempo restante y no vuelve a 10:00.
  - Sin reserva viva (nunca hubo o venció), `/checkout` redirige a `/tickets`.
  - Al llegar a 0, se muestra "Tu reserva expiró" con "Elegir entradas", y la selección del store se conserva.
  - El pago simulado guarda `lastOrder` con `eventId = event.id` y las líneas de la reserva, y `/confirmation` lo muestra. El pago no escribe en la DB.
- AC10 (validación en servidor): la action responde sin escribir nada en la DB:
  - con "Datos inválidos." ante una selección vacía, más de 6 por zona, una zona o un asiento repetido, `quantity` 0 o no entera, o ids que no son UUID;
  - con "Este evento ya no está disponible." si el evento es `draft`, `cancelled`, `finished`, ya empezó o el slug no existe;
  - con `unavailable` y rollback ante un asiento de otro evento o de otra zona, o una GA que no es del evento.
- AC11 (invariantes; consultas manuales tras AC1–AC6):
  - para cada zona GA, `held_count` = Σ `quantity` de los ítems GA de reservas `active`;
  - para cada evento, los asientos `held` son exactamente los `event_seat_id` de los ítems de reservas `active`;
  - ningún `event_seat_id` aparece en dos reservas `active`;
  - ninguna fila tiene `sold_count + held_count > capacity`.
- AC12 (UI):
  - mientras corre la action, "Continuar" está deshabilitado y dice "Reservando…";
  - el error se ve en escritorio y en la barra de móvil, con `role="alert"`;
  - un fallo no borra el resto de la selección.
- AC13 (política sin cambios): `getZoneStates`, `getZoneStatesByEvent`, `eventHasSales` y las guardas de `event-write-service.ts` siguen con los fragmentos crudos, así que el panel cuenta `held` como hasta hoy. `event-write-service.ts` solo cambia el origen de `pgErrorCode`.
- AC14 (calidad):
  - `reservation-service.ts` y los services de lectura no importan `next/*`;
  - la action sigue el patrón de `event/actions.ts`: `"use server"`, `requireRole` fuera del `try`, `safeParse`, `try/catch` con `console.error` y mensaje genérico;
  - no hay `revalidatePath` ni `refresh`;
  - no cambian `src/db/*`, `src/proxy.ts`, `current-user.ts`, `venue-service.ts`, `ReservationTimer.tsx`, `SeatMap.tsx`, `GeneralAdmissionPanel.tsx`, `VenueExplorer.tsx`, `venue-map.utils.ts` ni `next.config.ts`;
  - `grep -rn "reservationExpiresAt\|startReservation\|RESERVATION_MS" src` no devuelve nada;
  - `npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan en verde.

## Tests requeridos

(Vitest, junto al archivo)

- `src/lib/pg-error.test.ts`:
  - `pgErrorCode` devuelve el `code` string de primer nivel (forma de `NeonDbError`) y el de un `cause` anidado (forma de `DrizzleQueryError`);
  - devuelve `undefined` para un `Error` sin `code`, para un `code` no string y para `null`;
  - corta en profundidad 5.
- `src/modules/booking/reservation.schema.test.ts`:
  - acepta solo asientos, solo GA y mixto;
  - rechaza la selección vacía, más de 6 asientos en una zona, `quantity` 0, negativa, decimal o mayor a 6, un `eventZoneId` repetido (dentro de una lista y entre las dos), un `seatId` repetido, ids no UUID y `slug` vacío;
  - descarta claves desconocidas;
  - `MAX_TICKETS_PER_ZONE === 6`.
- `src/modules/booking/reservation.utils.test.ts`:
  - `isUnavailableError`: `true` para `{ code: "22012" }`, `{ code: "23514" }` y `{ cause: { code: "22012" } }`; `false` para `40P01`, `23505`, un `Error` simple y `undefined`.
  - `toReserveInput`:
    - las líneas con asientos van a `seats` con sus ids en orden; las líneas sin asientos van a `generalAdmission` con `quantity`;
    - conserva el orden;
    - `[]` → listas vacías.
  - `toReservationItems`: un ítem por asiento con `quantity: 1`; GA con `eventSeatId: null` y su cantidad; todos con el `reservationId` dado.
  - `findUnavailable`:
    - asientos: sin fila, con otra `eventZoneId` o con `free: false` → en `seatIds`; los libres no;
    - GA: sin fila o con `remaining` 0 o negativo → en `zoneIds`; con `remaining` > 0 pero menor a lo pedido → no;
    - todo disponible → listas vacías.
  - `toActiveReservation`:
    - `expiresAt` en ISO;
    - agrupa por zona en el orden de entrada;
    - suma cantidades;
    - `amount = (quantity × priceCents) / 100`, incluido un precio con céntimos (p. ej. 1999 × 3 = 59.97);
    - asientos por fila en orden natural (`"2"` < `"10"`) y por número, con `x`/`y` nulos → 0;
    - GA con `seats: []`.
- `src/modules/booking/booking.store.test.ts` (se actualiza):
  - se borra el `describe("startReservation")` y las aserciones de `reservationExpiresAt`;
  - `confirmOrder({ eventId, lines, … })` usa esas líneas y ese `eventId` (aunque el store tenga otro), calcula totales con `getOrderTotals` y limpia la selección;
  - `pruneSelection` quita los asientos indicados de cualquier zona y borra las cantidades de las zonas indicadas, también si la zona estaría `sold-out`;
  - `MAX_TICKETS_PER_ZONE` sigue importándose del store;
  - los demás casos siguen en verde.
- **Sin unit tests** para `reservation-service.ts`, `event-facts-service.ts`, `event-public-service.ts`, `venue-map-service.ts` ni `actions.ts`. Es el precedente del repo:
  - no hay mock de `@/db`: `vi.mock` solo aparece en los tests de hooks de `event`;
  - el SQL queda fino y la lógica va a utils puros.

  Las guardas y los fragmentos se verifican con AC1–AC7 y AC11. `venue-map.utils.test.ts` no cambia y debe seguir en verde. Páginas y componentes visuales no requieren test.

## Tareas

### T1 — Núcleo puro de la reserva y `pgErrorCode` compartida

- Archivos: `src/lib/pg-error.ts`, `src/lib/pg-error.test.ts`, `src/modules/event/services/event-write-service.ts` (solo el cambio de import), `src/modules/booking/reservation.types.ts`, `src/modules/booking/reservation.schema.ts`, `src/modules/booking/reservation.schema.test.ts`, `src/modules/booking/reservation.utils.ts`, `src/modules/booking/reservation.utils.test.ts`
- Depende de: —
- Paralelizable: sí (ola 1, con T2). No importa nada de T2: solo tipos de `booking.types.ts` y zod.
- Cubre: AC10 (schema), AC13 (`pgErrorCode`), AC14 (tests)

### T2 — Lecturas vivas: fragmentos, mapa y lecturas públicas

- Archivos: `src/modules/event/services/event-facts-service.ts`, `src/modules/event/services/event-public-service.ts`, `src/modules/booking/services/venue-map-service.ts`
- Depende de: —
- Paralelizable: sí (ola 1, con T1).
  - `readerId` es opcional: las páginas actuales compilan sin cambios hasta T4.
  - Los fragmentos crudos y los que usa la política no cambian.
- Cubre: AC1 (lectura), AC5 (lecturas), AC7 (lectura), AC13

### T3 — Servicio de reserva y Server Action

- Archivos: `src/modules/booking/services/reservation-service.ts`, `src/modules/booking/actions.ts`
- Depende de: T1 (tipos, schema, utils, `pgErrorCode`) y T2 (`releasableReservation`, `effectiveSeatStatus`, `liveZoneOccupancy`)
- Paralelizable: no (ola 2, sola)
- Cubre: AC2, AC3, AC4, AC5 (barrido), AC6, AC8 (action), AC10, AC11, AC14

### T4 — Store, selección, checkout y rutas con sesión

- Archivos: `src/modules/booking/booking.store.ts`, `src/modules/booking/booking.store.test.ts`, `src/modules/booking/components/OrderSummary.tsx`, `src/modules/booking/components/TicketSelection.tsx`, `src/modules/booking/components/CheckoutForm.tsx`, `src/app/(platform)/events/[slug]/tickets/page.tsx`, `src/app/(platform)/events/[slug]/checkout/page.tsx`
- Depende de: T1 (`toReserveInput`, tipos, `MAX_TICKETS_PER_ZONE`), T2 (`getEventVenueMap(event, readerId)`) y T3 (`reserveTicketsAction`, `getActiveReservation`)
- Paralelizable: no (ola 3, sola). Las cosas van juntas porque no compilan por separado:
  - el store y `CheckoutForm` (que hoy usa `startReservation`/`reservationExpiresAt`);
  - `TicketSelection` y `OrderSummary` (cambian props);
  - las páginas y `CheckoutForm` (prop `reservation`).
- Cubre: AC1, AC2 (UI), AC4 (poda GA), AC7, AC8, AC9, AC12, AC14

Olas:

- **Ola 1** = T1 ∥ T2 (archivos disjuntos, sin imports entre sí).
- **Ola 2** = T3.
- **Ola 3** = T4.

**Paralelizables: T1 y T2.**

## Preguntas abiertas

Cada pregunta trae un valor por defecto: si no hay respuesta, se aplica ese valor.

1. **¿Sesión para ver el mapa o solo al "Continuar"?** Por defecto: **en la página**. `/tickets` y `/checkout` exigen sesión, con retorno a la misma página (lectura literal de la tarjeta). El detalle `/events/[slug]` sigue público y muestra la disponibilidad.
2. **Lo que retiene el propio usuario.** Por defecto: **se le muestra libre** (D6), tanto en el asiento como en la ocupación de la zona, y "Continuar" lo reemplaza. La alternativa sería mostrarlo "seleccionado" cargando la reserva en el store, lo que exige leer la reserva en `/tickets` (ver "Próximas fases").
3. **Checkout al vencer el temporizador.** Por defecto: **el `EmptyState` "Tu reserva expiró"** con "Elegir entradas", sin `reset()`: la selección se conserva para volver a reservar en un clic. Recargar `/checkout` con la reserva vencida redirige a `/tickets`. La alternativa es redirigir solo a `/tickets` al llegar a 0.
4. **`max_per_order` (DB, default 10) vs `MAX_TICKETS_PER_ZONE` (6).** Por defecto: **6 en el cliente y en el servidor** (zod). `max_per_order` no se lee: ningún formulario lo edita y todas las filas tienen 10. Unificarlos queda para cuando el organizador pueda configurarlo.
5. **Lecturas públicas vivas.** Por defecto: **sí** (D7). Landing, búsqueda y detalle usan `liveZoneOccupancy()`, y la política del panel sigue con lo crudo. Si se respondiera "no", el detalle mostraría "Agotado" con holds vencidos y ocultaría la compra hasta la tarjeta 10.
6. **Discrepancia con `system-design.md §5.2` y `erd.md §4` ("el job marca vencidas").** Por defecto: **se barre al reservar, por evento (D2), y las lecturas ignoran lo vencido**. El job de la tarjeta 10 sigue siendo necesario para liberar eventos sin actividad. Las dos rutas usan la misma transición (`active` → `expired`, asientos → `available`, `held_count −`) y son idempotentes entre sí por el `WHERE status = 'active'`.
7. **Discrepancia con la guarda GA de `erd.md §4`** (`<= capacity`). Por defecto: **`<= coalesce(capacity, 0)`**. Con `capacity` NULL, la condición del ERD y el CHECK dan NULL y no frenan nada. Tratar NULL como 0 (no vendible) es coherente con `zoneCapacity` y con `resolveReferences`, que exige capacidad ≥ 1 en GA.
8. **Discrepancia con la guarda de asiento de `erd.md §4`** ("si afecta 0 filas, el asiento ya no está disponible"). Con `neon-http` no se puede revisar el conteo a mitad de la transacción. Por defecto: **el conteo se convierte en error con una división por cero** (D1), y el resultado observable es el mismo.
9. **El pago simulado no toca la reserva.** Por defecto: **sigue `active` hasta vencer**, y sus asientos se ven ocupados para otros durante ese tiempo. Convertirla (`converted`, `sold`, `sold_count`) es de la tarjeta 07.
10. **Reloj del navegador.** Por defecto: el temporizador compara `Date.parse(expiresAt)` con `Date.now()` del navegador y **se acepta el desfase**. Si el navegador va adelantado, el aviso de vencimiento sale antes, sin consecuencias; si va atrasado, el pago simulado podría correr con la reserva ya vencida, y la validación real es de la tarjeta 07. Corregir con la hora del servidor queda para "Próximas fases".
11. **Deadlock entre reservas concurrentes (`40P01`).** Por defecto: **mensaje genérico, sin reintento automático**. Postgres aborta una de las dos, el batch se deshace completo y el usuario vuelve a pulsar "Continuar".
12. **Las reservas cuentan como historial del evento** (`hasOrders`, `event-crud.md:24`). Por defecto: **se acepta tal cual está diseñado**. Desde la primera reserva, aunque venza o se libere, el evento ya no se puede borrar (solo cancelar) y sus zonas no se pueden quitar.
13. **GA con menos cupo que lo pedido, pero mayor a 0.** Por defecto: **no se recorta la cantidad**. Se muestra `unavailable`, la zona sigue abierta y el usuario ajusta. El tope del selector por cupo restante queda para "Próximas fases".
14. **Ver reservas de otros en vivo.** Por defecto: **al cargar o recargar** (D8), sin polling ni tiempo real. Si a B le ganan el asiento, se entera al pulsar "Continuar", y el mapa se actualiza solo en ese momento.

## Próximas fases

- Tarjeta 07: orden `pending` + pago (Stripe), conversión de la reserva (`converted`, `event_seat` → `sold`, `sold_count + n` / `held_count − n`) y validación en el servidor de que la reserva sigue viva al pagar.
- Tarjeta 10: job `/api/jobs/release-holds`, con la misma transición que S1 pero sin evento.
- Respetar `event_zone.max_per_order` y limitar el selector GA al cupo restante.
- Cargar la reserva viva en `/tickets` para mostrar lo propio como "seleccionado" aunque el store esté vacío (otro dispositivo).
- Temporizador con desfase de reloj corregido (hora del servidor en la página).
- Disponibilidad en vivo (polling o push) en `/tickets`.
