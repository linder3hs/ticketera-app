# Webhook de Stripe: confirmar el pago y emitir entradas

Estado: aprobada

## Objetivo

Hoy la orden queda `pending` después de pagar (tarjeta 07). Nada la pasa a `paid`, la reserva sigue `active` hasta vencer y no existe ninguna fila `ticket`. Esta spec corresponde a la tarjeta Trello "08 · Webhook de Stripe: confirmar pago y emitir entradas". El pago solo es real cuando Stripe lo confirma, y en ese momento se venden los asientos y nacen las entradas:

1. `POST /api/webhooks/stripe` verifica la firma con `STRIPE_WEBHOOK_SECRET` y es idempotente vía `stripe_event`.
2. `payment_intent.succeeded` hace todo en **una sola transacción** (`db.batch`) con guardas en la DB:
   - `payment.succeeded` + `stripe_charge_id`;
   - `orders.paid` + `paid_at`;
   - `reservation.converted`;
   - `event_seat` `held → sold` y, en GA, `sold_count += n`, `held_count -= n`;
   - un `ticket` por `order_item` con `code` único.
3. Si la reserva ya no se puede convertir (hold vencido o reemplazado), se **reembolsa** y la orden queda `cancelled`.

**Listo cuando** reenviar el mismo evento no duplica entradas (AC3, con test de Vitest).

Referencias (consultar solo estas secciones):

- `system-design.md §5.1`:
  - paso 3: "Webhook `payment_intent.succeeded` (idempotente vía `stripe_event`): `orders.paid`, `reservation.converted`, `event_seat`→`sold` o `sold_count`+`n` con `held_count`−`n`, se emite un `ticket` por `order_item` con `code` único para el QR";
  - paso 4: "Pago fallido o reserva vencida: `orders.failed`/`cancelled` y se libera el inventario". **Esta spec contradice en parte el paso 4**: ver D9 y la Pregunta 1.
- `system-design.md §5.4`: el reembolso a pedido crea `refund` + `refund_ticket`, y `orders` pasa a `partially_refunded`/`refunded`. Se usa para decidir el estado final del camino de reembolso (D8, Pregunta 2).
- `erd.md §4`:
  - "Webhooks idempotentes: `stripe_event.id` PK impide procesar dos veces el mismo evento; `stripe_refund_id` y `stripe_payment_intent_id` son UQ";
  - "Un ticket por ítem: `ticket.order_item_id` es UQ";
  - guardas de asiento y GA y liberación (el estado vive en `event_seat`, no hay `seat_hold`).
- `erd.md §3`, grupos **Compra y pago**, **Entrada y check-in** y **Reembolso** (`refund.payment_id`, `reason`, `stripe_refund_id` UQ).
- Specs en las que se apoya:
  - `checkout-stripe-payment-intent.md` (07): "Contrato con la tarjeta 08", D5, D7, D8 y D15, y las Preguntas 6 a 8;
  - `reservation-hold.md` (05): D1, "Hechos verificados" y "Mecanismo de aborto";
  - `organizer-stripe-connect.md` (06): patrón del webhook de Connect y `stripe-event-service.ts`.

### Hechos verificados (repo, 2026-10-12)

- **El reintento reutiliza el mismo PaymentIntent y solo lee `orders.status`.**
  - `payment-service.ts:28-29`: con `payment` existente se hace `retrievePaymentIntent` del mismo PI y no se crea otro.
  - `checkout-service.ts:63`: una orden no `pending` responde `orderClosed`.
  - `payment-record-service.ts:21-25` solo lee `id`, `orderId` y `stripePaymentIntentId`: **nadie lee `payment.status`**.
  - Cada "Pagar" llama primero a `startCheckout` (`use-checkout-payment.ts:42`), y por D8 de 07 eso exige una reserva viva.
  - Consecuencia: `payment_intent.payment_failed` llega en cada intento rechazado mientras el PI sigue abierto (vuelve a `requires_payment_method`). **No es terminal.**
- **`payment.utils.ts` se empaqueta en el cliente.** Lo importan `CheckoutForm.tsx:24`, `CardPaymentProvider.tsx:7` y `use-checkout-payment.ts:7` (`"use client"`), así que no puede importar `node:crypto`. `checkout.utils.ts` (booking) sí lo importa, pero solo lo usan el servidor y una página.
- **`server-only` no se puede importar en un archivo con tests.** Su entrada por defecto lanza fuera de la condición `react-server`. Por eso `stripe-client.ts` lo importa y los tests mockean el módulo del gateway (`payment-service.test.ts:12`, `connect-webhook-service.test.ts:17`).
- **`payment-service.test.ts:31` declara su fake con `satisfies PaymentGateway`.** Agregar métodos a `PaymentGateway` rompería `tsc` en ese test. Ver D2.
- **Idempotencia actual**: `stripe-event-service.ts` hace check-then-act (`hasProcessedStripeEvent` y luego `markStripeEventProcessed` con `onConflictDoNothing`). Dos entregas concurrentes pasan las dos el check: no basta como única defensa.
- **Neon HTTP**:
  - `src/db/index.ts` usa `drizzle-orm/neon-http`, sin `db.transaction()`;
  - `db.batch` es una transacción no interactiva en `READ COMMITTED` que solo revierte si una sentencia **lanza**;
  - las guardas abortan con `1 / (count(*) = n)::int` (SQLSTATE `22012`) porque no se puede revisar `rowCount` a mitad del batch;
  - en SQL crudo `updated_at` se fija a mano (`$onUpdate` solo corre con `.update().set()`).
  - Fuente: `reservation-hold.md`, "Hechos verificados" y "Mecanismo de aborto", y `reservation-service.ts:30-119`.
- **El barrido de 05** (`reservation-service.ts:47-75`, S1, privado) libera, cuando alguien reserva en el evento, las reservas `active` vencidas (→ `expired`) y la reserva viva propia del que reserva (→ `released`, D3 de 05): devuelve sus asientos `held → available` y baja `held_count`. No toca `orders`. Después del barrido, esos asientos pueden quedar `held` **por otra reserva**.
- **`event_seat` no tiene columna que lo ligue a una reserva.** El vínculo es `reservation_item.event_seat_id`, y en GA `reservation_item.quantity` con `event_seat_id` NULL (`reservation.ts:29-49`). `reservation_item` no cambia después de crearse.
- **Esquema** (sin migración necesaria):
  - `orders.status` ∈ `pending|paid|failed|cancelled|partially_refunded|refunded`; `orders.reservation_id` es nullable y UQ; `orders.buyer_name` es NOT NULL (`order.ts:33`);
  - `payment` (`order_id` UQ, `stripe_payment_intent_id` UQ, `stripe_charge_id` nullable, `status` ∈ `pending|succeeded|failed`);
  - `stripe_event.id` es PK;
  - `ticket` (`order_item_id` UQ, `code` UQ, `holder_name` NOT NULL, `status` default `valid`);
  - `event_zone_capacity_check` = `sold_count + held_count <= capacity`;
  - `refund_reason` ∈ `customer_request|event_cancelled|admin` (`enums.ts:74-78`) y `refund.payment_id` es NOT NULL.
- **Stripe SDK `stripe@23.0.0`** (leído en `node_modules/stripe/esm`):
  - `webhooks.constructEvent(payload, header, secret)` (`Webhooks.d.ts:46`);
  - `RefundCreateParams` tiene `payment_intent`, `refund_application_fee` y `reverse_transfer` (`resources/Refunds.d.ts:428-475`);
  - `PaymentIntent.latest_charge: string | Charge | null` (`resources/PaymentIntents.d.ts:250`);
  - existen los códigos de error `charge_already_refunded` e `idempotency_key_in_use`;
  - `Stripe.errors.StripeSignatureVerificationError` ya se usa en `stripe-connect-gateway.ts:87`.
  - El worktree no tiene `node_modules`: el developer confirma en su entorno.
- **Next 16**: en `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md`, la sección "Webhooks" (~l. 561) lee el cuerpo con `await request.text()`. Los `POST` no se cachean.
- **`src/proxy.ts`**: `/api/webhooks/*` no está en `isProtected`, así que el middleware retorna sin exigir sesión, igual que `stripe-connect`. No se toca.
- **Env**: `STRIPE_WEBHOOK_SECRET` ya está en `.env.example:21` con el comentario de la 08. El `.env` lo gestiona el humano (precedente de 06): ningún agente lo edita.
- **No hay T0**: `stripe` ya está en dependencias, no hay variables nuevas, no cambian el esquema ni los enums, y no se tocan `package.json`, `layout.tsx` ni `globals.css`.

## Decisiones

- **D1: ruta fina + servicio, igual que Connect.**
  - `src/app/api/webhooks/stripe/route.ts` lee `await request.text()` y el header `stripe-signature`, llama `handlePaymentWebhook` y responde `new Response(status === 200 ? "ok" : "error", { status })`.
  - El servicio devuelve `{ status: 200 | 400 | 500 }`:
    - firma ausente o inválida → 400, sin tocar la DB;
    - evento ignorado o ya procesado → 200;
    - fallo → 500, sin registrar el evento (Stripe reintenta);
    - error de configuración (falta el secreto) → 500.
- **D2: puerto separado `PaymentWebhookGateway` (ISP), implementado por el mismo `stripePaymentGateway`.**
  - Contiene `parseWebhook` y `refundPayment`.
  - El checkout no los necesita, y extender `PaymentGateway` rompería `payment-service.test.ts:31` (`satisfies`), que pasaría a necesitar dueño.
  - `stripePaymentGateway` pasa a tiparse `PaymentGateway & PaymentWebhookGateway`: `preparePayment` lo sigue aceptando como `PaymentGateway`.
  - Solo `payment` habla con Stripe.
- **D3: evento estrecho.**
  - `parseWebhook` devuelve `{ id, type, paymentIntentId, chargeId }`.
  - Si `data.object.object === "payment_intent"`: `paymentIntentId = object.id` y `chargeId = typeof latest_charge === "string" ? latest_charge : latest_charge?.id ?? null`.
  - Si es cualquier otro objeto: los dos en `null`.
  - No se expone `metadata`: el emparejamiento es por `payment.stripe_payment_intent_id`, que el contrato de 07 hace autoritativo (YAGNI).
- **D4: pre-lectura y enrutamiento antes de escribir.**
  - Primero el camino rápido: si `hasProcessedStripeEvent(event.id)`, responde 200.
  - Después, `findPaymentContext(paymentIntentId)` (payment ⨝ orders ⟕ reservation, más los ids de `order_item`).
  - `routeSucceededPayment(orderStatus, reservationStatus)` es pura:

  | Orden | Reserva | Ruta |
  | --- | --- | --- |
  | `paid`, `partially_refunded`, `refunded` | cualquiera | `alreadyPaid`: registrar el evento → 200 |
  | `pending` | `active` (vencida o no) | `fulfill`: batch de conversión |
  | `pending` | `expired`, `released`, `converted` o sin reserva | `refund` |
  | `failed`, `cancelled` | cualquiera | `refund` (el UPDATE con guarda no cambia la orden) |

  - Si no existe la fila `payment` (PI desconocido), se loguea, se registra el evento y se responde 200 (Pregunta 5). Es el caso de `stripe trigger payment_intent.succeeded` en local.
- **D5: batch de conversión único** (`fulfillOrder`, ver "Batch de conversión"):
  - orden de las sentencias: `INSERT stripe_event` → reserva → asientos → GA → orden → payment → tickets;
  - cada UPDATE es una guarda `with u as (update … returning id) select 1 / (count(*) = n)::int` vía `db.execute(sql…)`.
  - No se usa un `UPDATE` con builder seguido de un `SELECT` de control: el `SELECT` vería la fila ya `paid` por la entrega gemela y la guarda pasaría (doble `sold_count`).
  - El orden reserva → `event_seat` → `event_zone` es el mismo del barrido S1, para no introducir ciclos de locks.
- **D6: convertible no es `reservation.status` a secas.**
  - Una reserva `active` se convierte **aunque `expires_at` ya haya pasado** (el job de la 10 no corrió y el comprador pagó): la guarda de la reserva no mira `expires_at`.
  - No es convertible:
    - si la reserva está `expired` o `released`: el barrido o el reemplazo ya liberaron su inventario, y los asientos pueden estar `held` por otra reserva, así que una guarda solo de asientos los robaría;
    - si algún asiento de sus `reservation_item` ya no está `held`;
    - si una zona GA tiene `held_count` menor que lo que la reserva retiene.
  - La guarda de la reserva es la primaria: mientras la reserva está `active`, su inventario sigue retenido por construcción (todo escritor cambia el estado de la reserva y el inventario en la misma transacción). Las guardas de asiento y GA son defensa en profundidad.
- **D7: clasificación después de un aborto.**
  - `fulfillOrder` lanza `22012` (guarda), `23514` (CHECK de capacidad) o `23505` (PK de `stripe_event` por una entrega gemela ya confirmada, o una colisión de `ticket.code`).
  - Ante esos códigos se **relee una vez** el contexto y se reenruta:

  | Código | Releído → ruta | Acción |
  | --- | --- | --- |
  | `22012` / `23514` / `23505` | `alreadyPaid` | Perdió la carrera con otra entrega: registrar el evento (no-op si ya está) → 200 |
  | `22012` / `23514` / `23505` | `refund` | Camino de reembolso (D8) → 200 |
  | `22012` / `23514` | `fulfill` (sigue `pending` + `active`) | Desajuste persistente de inventario: `console.error` + camino de reembolso (D8) → 200 |
  | `23505` | `fulfill` | Colisión de `ticket.code` (≈2⁻¹²⁸): relanzar → 500; el reintento genera códigos nuevos |
  | cualquier otro (red, `40P01`, …) | — | Relanzar → 500, sin registrar nada |

  - **Por qué "`fulfill` tras `22012`" no es transitorio**:
    - con `READ COMMITTED`, cada UPDATE espera el lock de la fila y reevalúa su `WHERE` sobre la versión confirmada;
    - si una transacción concurrente revierte, la guarda pasa;
    - si confirma, el releído ya ve su efecto (orden `paid` o reserva no `active`).
  - Un releído `pending` + `active` después de `22012` solo puede venir de un inventario inconsistente: reintentar daría el mismo `22012` durante los 3 días de reintentos de Stripe, con el comprador cobrado y sin entradas. Por eso se reembolsa (alternativa en la Pregunta 2).
- **D8: camino de reembolso (carrera (a) del contrato de 07).**
  - Orden de escritura:
    1. `gateway.refundPayment(paymentIntentId, "refund:<orderId>")`:
       - es `refunds.create({ payment_intent, reverse_transfer: true, refund_application_fee: true }, { idempotencyKey })`;
       - es un destination charge: sin `reverse_transfer` la plataforma asume la pérdida;
       - si Stripe responde `charge_already_refunded` (reintento fuera de la ventana de 24 h de la clave), se trata como hecho y devuelve `{ refundId: null }`.
    2. `cancelRefundedOrder` (un `db.batch`):
       - `payment` → `succeeded` + `stripe_charge_id` `WHERE status='pending'`: el cobro sí ocurrió y el reembolso vive en Stripe;
       - `orders` → `cancelled` `WHERE status='pending'`.
    3. `console.warn` con `orderId` y `refundId`.
    4. `markStripeEventProcessed`.
  - No se emiten tickets ni se toca inventario: el barrido o la 10 ya lo liberaron, o la reserva `active` desajustada se libera al vencer.
  - No se crea fila `refund` (Pregunta 2):
    - `refund_reason` no tiene un valor que corresponda;
    - `§5.4` liga `refunded` a `refund` + `refund_ticket`, y aquí no hay tickets.
  - Si el reembolso falla: 500 sin cambios en la DB. Si falla el UPDATE: 500. En los dos casos el reintento repite (1) con la misma clave (misma devolución) y completa (2): es consistente y sin bucle.
- **D9: `payment_intent.payment_failed` solo se loguea** (Pregunta 1).
  - `console.info` con `event.id` y `paymentIntentId`, y 200, sin leer ni escribir la DB ni registrar el evento.
  - No es terminal (ver "Hechos verificados").
  - Marcar `orders.failed` haría que el reintento responda `orderClosed` (`checkout-service.ts:63`).
  - Liberar inventario dejaría un PI abierto sin hold.
  - Marcar `payment.failed` haría que la guarda `payment.status='pending'` del batch abortara siempre cuando el reintento sí pague.
- **D10: `stripe_event` dentro del batch de conversión** (Pregunta 6).
  - El `INSERT stripe_event` (sin `ON CONFLICT`) es la primera sentencia: el evento queda registrado si y solo si la conversión se confirmó.
  - Una entrega gemela concurrente espera el lock del índice de la PK y aborta con `23505` antes de tomar locks de reserva o inventario.
  - Para eso, `stripe-event-service.ts` expone un builder sin ejecutar, `stripeEventInsert(id, type)`, que `markStripeEventProcessed` reutiliza con `.onConflictDoNothing()` (DRY). `hasProcessedStripeEvent` sigue como camino rápido.
  - La guarda `orders.status='pending'` sigue siendo la que garantiza "una sola conversión por orden" aunque lleguen **eventos distintos** del mismo PI.
  - Los caminos sin batch (PI desconocido, `alreadyPaid`, reembolso) registran el evento aparte con `markStripeEventProcessed`, como Connect.
- **D11: `ticket.code` = 16 bytes de `crypto.randomBytes` en base64url** (22 caracteres `[A-Za-z0-9_-]`, 128 bits; Pregunta 3).
  - Va en `src/modules/payment/ticket.utils.ts`, un archivo nuevo de servidor **sin** `import "server-only"` porque tiene tests. No va en `payment.utils.ts`, que se empaqueta en el cliente.
  - No se extrae un generador común con `generateOrderCode` (DRY descartado por KISS):
    - el propósito es distinto (código humano corto vs token opaco de QR), igual que el alfabeto y la entropía;
    - la implementación es de una línea;
    - extraerlo tocaría `checkout.utils.ts` y su test (booking).
  - `holder_name = orders.buyer_name`.
  - Unicidad: el UQ de `ticket.code` + D7 (`23505` → 500 → reintento).
- **D12: logs sin datos personales.** Solo ids (`event.id`, `paymentIntentId`, `orderId`, `refundId`) y `error.message`, con prefijo `[stripe]`. Nunca nombre, correo ni documento.

### Batch de conversión (`fulfillOrder`, una sola llamada `db.batch`, en este orden)

Parámetros: `$event`/`$type` (evento de Stripe), `$r` (reserva), `$o` (orden), `$p` (payment), `$charge` (puede ser NULL). Se interpolan las tablas de Drizzle como en `reservation-service.ts` (sin alias para `reservation`, `event_seat` y `event_zone`).

1. **S1 evento** (builder): `stripeEventInsert($event, $type)`. Es `INSERT` sin `ON CONFLICT`: un duplicado lanza `23505`.
2. **S2 reserva** (guarda primaria, D6):

   ```sql
   with converted as (
     update reservation set status = 'converted', updated_at = now()
      where id = $r::uuid and status = 'active'
     returning id
   )
   select 1 / (count(*) = 1)::int as ok from converted
   ```

3. **S3 asientos** (siempre: con 0 asientos, `0 = 0`):

   ```sql
   with sold as (
     update event_seat set status = 'sold', updated_at = now()
      where id in (select event_seat_id from reservation_item
                    where reservation_id = $r::uuid and event_seat_id is not null)
        and status = 'held'
     returning id
   )
   select 1 / (count(*) = (select count(distinct event_seat_id) from reservation_item
                            where reservation_id = $r::uuid and event_seat_id is not null))::int as ok
     from sold
   ```

4. **S4 GA** (siempre: sin ítems GA, `0 = 0`; `held_count` baja una vez por zona):

   ```sql
   with ga as (
     select event_zone_id, sum(quantity)::int as quantity
       from reservation_item
      where reservation_id = $r::uuid and event_seat_id is null
      group by event_zone_id
   ),
   moved as (
     update event_zone
        set sold_count = event_zone.sold_count + ga.quantity,
            held_count = event_zone.held_count - ga.quantity,
            updated_at = now()
       from ga
      where event_zone.id = ga.event_zone_id and event_zone.held_count >= ga.quantity
     returning event_zone.id
   )
   select 1 / (count(*) = (select count(*) from ga))::int as ok from moved
   ```

   `sold_count + held_count` no cambia, así que el CHECK de capacidad se mantiene por construcción (`23514` es solo la red de seguridad).
5. **S5 orden**:

   ```sql
   with paid as (
     update orders set status = 'paid', paid_at = now(), updated_at = now()
      where id = $o::uuid and status = 'pending'
     returning id
   )
   select 1 / (count(*) = 1)::int as ok from paid
   ```

6. **S6 payment**:

   ```sql
   with settled as (
     update payment set status = 'succeeded', stripe_charge_id = $charge, updated_at = now()
      where id = $p::uuid and status = 'pending'
     returning id
   )
   select 1 / (count(*) = 1)::int as ok from settled
   ```

7. **S7 tickets** (builder): `db.insert(ticket).values(tickets).onConflictDoNothing({ target: ticket.orderItemId })`.
   - Es defensa en profundidad: S5 ya impide entrar dos veces.
   - Un choque de `code` sí lanza `23505` (D7).
   - `tickets` vacío no es posible (07 crea al menos un `order_item`): `fulfillOrder` lanza un `Error` antes del batch.

- **No usar `CASE … ELSE 1/0 END`**: el planner puede plegar `1/0` y fallar aunque el conteo coincida (`reservation-hold.md`). `count(*)` y las subconsultas escalares se evalúan al ejecutar.
- Si una sentencia lanza, Postgres revierte todo el batch: no queda ni el `stripe_event`, ni la reserva `converted`, ni tickets.

## Alcance

- Incluye:
  - **Núcleo puro y gateway (T1)**:
    - tipos `PaymentWebhookEvent`, `PaymentWebhookGateway`, `OrderStatus`, `ReservationStatus` y `SucceededPaymentRoute`, y el doc de `WebhookSignatureError` actualizado;
    - `PAYMENT_EVENT_TYPES`, `routeSucceededPayment` e `isGuardAbort` en `payment.utils.ts`;
    - `generateTicketCode` y `toNewTickets` en `ticket.utils.ts`;
    - `parseWebhook` y `refundPayment` en `stripe-payment-gateway.ts`.
  - **Datos (T2)**: `findPaymentContext`, `fulfillOrder` (batch con guardas) y `cancelRefundedOrder` en `payment-fulfillment-service.ts`, y el builder `stripeEventInsert` en `stripe-event-service.ts`.
  - **Handler y ruta (T3)**: `handlePaymentWebhook` (D1, D4, D7, D8 y D9) y `src/app/api/webhooks/stripe/route.ts`.
  - **Reembolso automático por hold perdido** (D8; desactivable con la Pregunta 2).
- No incluye:
  - `charge.refunded`, `refund.updated`, filas `refund`/`refund_ticket` y el flujo de reembolsos (tarjeta 12), salvo el reembolso de D8.
  - `payment_intent.canceled` (Pregunta 1, tarjeta 10), el job `/api/jobs/release-holds` y la limpieza de órdenes `pending` huérfanas y de sus PaymentIntents (tarjeta 10).
  - Confirmación, "Mis entradas" con datos reales y QR real (tarjeta 09). La confirmación local transitoria (D15 de 07) queda igual (Pregunta 4).
  - Correo de confirmación.
  - Registrar el endpoint de producción en el Dashboard de Stripe (operación del humano; Pregunta 7).
  - Cambios en `src/modules/booking/*`, los archivos de Connect (`connect-*`, `stripe-connect-gateway.ts`, `webhooks/stripe-connect/route.ts`), `payment-service.ts` y su test, `payment-record-service.ts`, `src/db/schema/*`, `drizzle/*`, `src/proxy.ts`, `.env`/`.env.example`, `package.json` y `docs/architecture/*`.

## Reutilizar

- **Patrón del webhook de Connect**:
  - `src/app/api/webhooks/stripe-connect/route.ts` (ruta fina con `request.text()`);
  - `connect-webhook-service.ts` (estructura, códigos 200/400/500, `catch` con `WebhookSignatureError`, registro después del trabajo);
  - `stripe-connect-gateway.ts:77-90` (mapeo de `StripeSignatureVerificationError` → `WebhookSignatureError`);
  - `connect-webhook-service.test.ts` (`vi.mock` del servicio de datos y de `stripe-event-service`, mock vacío del módulo del gateway real, gateway falso `satisfies …`).
- **`getStripeClient()`** (`stripe-client.ts`): único cliente Stripe.
- **`WebhookSignatureError`** (`payment.types.ts:16`): se reutiliza; solo cambia su comentario.
- **`hasProcessedStripeEvent` / `markStripeEventProcessed`** (`stripe-event-service.ts`): se conservan y se agrega el builder (D10).
- **`pgErrorCode`** (`src/lib/pg-error.ts`) para `22012`, `23514` y `23505`.
- **Técnica de guardas de `reservation-hold.md`** ("Mecanismo de aborto") y su forma en código: `db.execute(sql\`…\`)` dentro de `db.batch`, como en `reservation-service.ts:83-119`. Se reutiliza la técnica, no las funciones: S2/S3 de 05 son privadas y retienen inventario, no lo convierten.
- **Tablas**: `payment`, `orders`, `orderItem`, `reservation`, `reservationItem`, `eventSeat`, `eventZone`, `ticket`, `stripeEvent`.
- Descartado reutilizar:
  - `isUnavailableError` (`booking/reservation.utils.ts`): `payment` no importa `booking` (D19 de 07). `isGuardAbort` son 3 líneas con otro significado.
  - `generateOrderCode` (D11).
  - `requireEnv` (privado en `stripe-connect-gateway.ts`): extraerlo tocaría un archivo de Connect. El secreto se lee en línea con su `throw`.
  - El barrido S1 de 05, que es privado y está pensado por usuario y evento: el camino de reembolso no libera inventario.

## Archivos

| Archivo | Cambio | Tarea |
| --- | --- | --- |
| `src/modules/payment/payment.types.ts` | + `PaymentWebhookEvent`, `PaymentWebhookGateway`, `OrderStatus`, `ReservationStatus`, `SucceededPaymentRoute`; doc de `WebhookSignatureError` (lo lanzan los dos `parseWebhook`) | T1 |
| `src/modules/payment/payment.utils.ts` | + `PAYMENT_EVENT_TYPES`, `routeSucceededPayment`, `isGuardAbort` (sin `node:crypto`: se empaqueta en el cliente) | T1 |
| `src/modules/payment/payment.utils.test.ts` | ampliado, sin romper los casos de 06/07 | T1 |
| `src/modules/payment/ticket.utils.ts` | nuevo (servidor, sin `server-only`): `generateTicketCode`, `NewTicket`, `toNewTickets` | T1 |
| `src/modules/payment/ticket.utils.test.ts` | nuevo | T1 |
| `src/modules/payment/services/stripe-payment-gateway.ts` | + `parseWebhook` y `refundPayment`; tipo `PaymentGateway & PaymentWebhookGateway` | T1 |
| `src/modules/payment/services/payment-fulfillment-service.ts` | nuevo (DB): `findPaymentContext`, `fulfillOrder`, `cancelRefundedOrder` | T2 |
| `src/modules/payment/services/stripe-event-service.ts` | + `stripeEventInsert` (builder); `markStripeEventProcessed` lo reutiliza; `hasProcessedStripeEvent` no cambia | T2 |
| `src/modules/payment/services/payment-webhook-service.ts` | nuevo: `handlePaymentWebhook` | T3 |
| `src/modules/payment/services/payment-webhook-service.test.ts` | nuevo | T3 |
| `src/app/api/webhooks/stripe/route.ts` | nuevo: `POST` fino | T3 |

### Contratos fijados (para que T1 y T2 corran en paralelo y T3 no dependa de decisiones ajenas)

```ts
// payment.types.ts (T1)
import type { orderStatus, reservationStatus } from "@/db/schema/enums"; // solo tipos: no entra al bundle

export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];

/** What the app needs from a verified payments (v1 snapshot) webhook event. */
export interface PaymentWebhookEvent {
  id: string;
  type: string;
  /** The PaymentIntent the event is about; null when the object is not a PaymentIntent. */
  paymentIntentId: string | null;
  /** Id of the PaymentIntent's `latest_charge`; null when it has none. */
  chargeId: string | null;
}

/** Narrow port for the payments webhook (ISP: the checkout keeps using `PaymentGateway`). */
export interface PaymentWebhookGateway {
  /** Verifies with STRIPE_WEBHOOK_SECRET; throws `WebhookSignatureError` when invalid, `Error` when the secret is missing. */
  parseWebhook(payload: string, signature: string): PaymentWebhookEvent;
  /** Full refund reversing the transfer and the platform fee; same key → same refund; `null` id when already refunded. */
  refundPayment(paymentIntentId: string, idempotencyKey: string): Promise<{ refundId: string | null }>;
}

export type SucceededPaymentRoute = "fulfill" | "alreadyPaid" | "refund";

// payment.utils.ts (T1)
export const PAYMENT_EVENT_TYPES = {
  succeeded: "payment_intent.succeeded",
  failed: "payment_intent.payment_failed",
} as const;
export function routeSucceededPayment(orderStatus: OrderStatus, reservationStatus: ReservationStatus | null): SucceededPaymentRoute; // tabla de D4
/** A conversion guard aborted the batch: 22012 (guard) or 23514 (capacity CHECK). */
export function isGuardAbort(error: unknown): boolean;

// ticket.utils.ts (T1) — servidor (node:crypto); sin "server-only" porque tiene tests
export function generateTicketCode(randomBytes?: (size: number) => Buffer): string; // randomBytes(16).toString("base64url")
export interface NewTicket { orderItemId: string; eventId: string; holderName: string; code: string }
export function toNewTickets(
  orderItemIds: readonly string[],
  eventId: string,
  holderName: string,
  generateCode?: () => string, // por defecto generateTicketCode
): NewTicket[];

// stripe-payment-gateway.ts (T1)
export const stripePaymentGateway: PaymentGateway & PaymentWebhookGateway;

// payment-fulfillment-service.ts (T2) — tipos propios inferidos del esquema (no importa nada de T1)
export interface PaymentContext {
  paymentId: string;
  orderId: string;
  orderStatus: (typeof orders.$inferSelect)["status"];
  /** Internal event id (the order's), for the tickets. */
  eventId: string;
  buyerName: string;
  reservationId: string | null;
  reservationStatus: (typeof reservation.$inferSelect)["status"] | null;
  /** `order_item` ids of the order, ordered by id. */
  orderItemIds: string[];
}
/** payment ⨝ orders ⟕ reservation by PaymentIntent id, plus the order's item ids; null when no `payment` has it. */
export async function findPaymentContext(paymentIntentId: string): Promise<PaymentContext | null>;

export interface FulfillOrderInput {
  stripeEvent: { id: string; type: string };
  paymentId: string;
  orderId: string;
  reservationId: string;
  chargeId: string | null;
  /** One per `order_item` (≥ 1). `NewTicket[]` is assignable. */
  tickets: (typeof ticket.$inferInsert)[];
}
/** The conversion batch (S1–S7). Throws the Postgres error (22012/23514/23505) when a guard aborts; nothing is written. */
export async function fulfillOrder(input: FulfillOrderInput): Promise<void>;
/** One batch: payment → succeeded + charge and order → cancelled, each only while `pending`. Idempotent. */
export async function cancelRefundedOrder(input: { paymentId: string; orderId: string; chargeId: string | null }): Promise<void>;

// stripe-event-service.ts (T2)
/** Unexecuted INSERT of a handled event (no ON CONFLICT): a batch statement, or awaited by `markStripeEventProcessed`. */
export function stripeEventInsert(id: string, type: string); // db.insert(stripeEvent).values({ id, type })
export async function markStripeEventProcessed(id: string, type: string): Promise<void>; // await stripeEventInsert(id, type).onConflictDoNothing()

// payment-webhook-service.ts (T3)
export interface PaymentWebhookResult { status: 200 | 400 | 500 }
export async function handlePaymentWebhook(
  payload: string,
  signature: string | null,
  gateway?: PaymentWebhookGateway, // por defecto stripePaymentGateway
): Promise<PaymentWebhookResult>;
```

### Flujo de `handlePaymentWebhook` (T3)

1. Sin `signature` → 400, sin llamar al gateway.
2. Dentro de `try`: `event = gateway.parseWebhook(payload, signature)`.
3. `event.type === PAYMENT_EVENT_TYPES.failed` → `console.info` (D9) → 200, sin DB.
4. Otro tipo que no sea `succeeded`, o `paymentIntentId` nulo → 200, sin DB y sin registrar (como Connect).
5. `hasProcessedStripeEvent(event.id)` → 200.
6. `ctx = findPaymentContext(paymentIntentId)`:
   - si es `null`: `console.warn` (PI desconocido) → `markStripeEventProcessed` → 200;
   - si no, se enruta con `routeSucceededPayment`:
     - `alreadyPaid` → `markStripeEventProcessed` → 200;
     - `refund` → camino de reembolso (D8) → 200;
     - `fulfill` → `fulfillOrder({ stripeEvent, …, tickets: toNewTickets(ctx.orderItemIds, ctx.eventId, ctx.buyerName) })` → 200. El evento queda registrado dentro del batch.
7. Si `fulfillOrder` lanza:
   - con `pgErrorCode` ∈ {`22012`, `23514`, `23505`}: se aplica la tabla de D7, con **una** relectura (sin bucle). Si esa relectura devuelve `null` (no debería pasar: la fila `payment` no desaparece), se relanza el error original;
   - con otro error: se relanza.
8. `catch`:
   - `WebhookSignatureError` → 400;
   - cualquier otro error → `console.error("[stripe] payment webhook failed", message)` → 500, sin registrar el evento.

## Criterios de aceptación

Los manuales usan el modo test de Stripe, `stripe listen` (ver "Prueba local") y un evento publicado de un organizador con Connect `complete`.

- AC1 (firma): `POST /api/webhooks/stripe` verifica la firma sobre el cuerpo crudo con `STRIPE_WEBHOOK_SECRET`.
  - Sin header `stripe-signature` o con firma inválida responde 400 y no lee ni escribe la DB.
  - Sin `STRIPE_WEBHOOK_SECRET` responde 500.
  - La ruta solo llama a `handlePaymentWebhook`.
- AC2 (conversión): un `payment_intent.succeeded` de una orden `pending` con reserva `active` deja, en una sola transacción:
  - `payment.status = 'succeeded'` y `stripe_charge_id` = `latest_charge` del PI;
  - `orders.status = 'paid'` y `paid_at` no nulo;
  - `reservation.status = 'converted'`;
  - cada asiento de la reserva en `sold`;
  - en cada zona GA, `sold_count` sube y `held_count` baja en la cantidad reservada;
  - **un** `ticket` por `order_item` con `event_id` de la orden, `holder_name = orders.buyer_name`, `status = 'valid'` y `code` de 22 caracteres `[A-Za-z0-9_-]` distinto en cada ticket;
  - una fila `stripe_event` con el `id` y el `type` del evento.
- AC3 (Listo cuando, idempotencia):
  - reenviar el mismo evento responde 200 sin crear tickets ni tocar inventario, orden, reserva ni payment;
  - un evento **distinto** del mismo PI (orden ya `paid`) tampoco convierte nada y se registra;
  - lo cubre el test de "entrega doble" (Tests requeridos) y se verifica a mano reenviando el evento (Prueba local, paso 6).
- AC4 (concurrencia): dos entregas simultáneas del mismo evento producen exactamente una conversión. La otra aborta (`23505` o `22012`), relee la orden `paid` y responde 200. Lo cubren el test de entregas concurrentes y la revisión del SQL contra "Batch de conversión".
- AC5 (hold vencido pero intacto): una reserva `active` con `expires_at` en el pasado y su inventario aún `held` (nadie barrió) se convierte igual que en AC2.
- AC6 (hold perdido):
  - Se reembolsa en estos casos:
    - la reserva está `expired`/`released` o no existe;
    - la orden está `failed`/`cancelled`;
    - una guarda de inventario falla con la reserva `active`.
  - El reembolso es total en Stripe con `idempotencyKey = "refund:<orderId>"`, `reverse_transfer` y `refund_application_fee`.
  - **Después** del reembolso, `payment` pasa a `succeeded` con `stripe_charge_id` y la orden a `cancelled` (solo si estaba `pending`).
  - No se crea ningún `ticket`, no cambia el inventario, se registra el evento y responde 200.
  - Reenviar el evento o reintentarlo tras un fallo no crea un segundo reembolso en Stripe.
- AC7 (pago rechazado): `payment_intent.payment_failed` responde 200 y no escribe nada. La orden sigue `pending` y el comprador puede pagar con otra tarjeta en el mismo checkout; el AC7 de 07 sigue valiendo (`4000 0000 0000 0002` y luego `4242 4242 4242 4242` dejan una orden `paid` con sus tickets).
- AC8 (PI desconocido): `stripe trigger payment_intent.succeeded` responde 200, registra el evento y deja un `console.warn` con el id del PI. No hay 500 ni reintentos en bucle.
- AC9 (fallos): ante un error de la DB o de Stripe (que no sea un aborto de guarda clasificado), responde 500 y **no** registra el evento. El reintento de Stripe termina en el mismo estado que una entrega sin fallos (AC2 o AC6).
- AC10 (otros tipos): cualquier tipo que no sea `payment_intent.succeeded` ni `payment_intent.payment_failed` responde 200 sin leer ni escribir la DB.
- AC11 (`ticket.code`): `generateTicketCode()` usa 16 bytes de `crypto.randomBytes` en base64url. `payment.utils.ts` no importa `node:crypto` ni `ticket.utils.ts`.
- AC12 (fronteras):
  - `grep -rn 'from "stripe"' src` solo devuelve `stripe-client.ts`, `stripe-connect-gateway.ts` y `stripe-payment-gateway.ts`;
  - `STRIPE_WEBHOOK_SECRET` solo aparece en `stripe-payment-gateway.ts`;
  - el import de `@/db/schema/enums` en `payment.types.ts` es solo de tipos: en `grep -n 'from "@/db' src/modules/payment/payment.types.ts` todas las coincidencias empiezan con `import type` (un import de valor metería drizzle en el bundle del cliente);
  - los services no importan `next/*`;
  - `payment` no importa nada de `booking`;
  - los logs no incluyen nombre, correo ni documento;
  - no cambian los archivos listados en "No incluye".
- AC13 (calidad): `npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan en verde al cerrar cada ola. Los tests de 06/07 (`connect-webhook-service.test.ts`, `payment-service.test.ts`, `payment.utils.test.ts`) siguen pasando sin tocarse, salvo la ampliación de `payment.utils.test.ts`.

### Prueba local (verificación manual, no automatizada)

1. Una vez: `stripe login`.
2. Obtener el secreto del listener: `stripe listen --print-secret` (`whsec_…`, estable por cuenta y dispositivo). El **humano** lo pone como `STRIPE_WEBHOOK_SECRET` en su `.env` (ningún agente edita `.env`) y reinicia `npm run dev`.
3. Escuchar y reenviar:

   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe \
     --events payment_intent.succeeded,payment_intent.payment_failed
   ```

4. Comprar con `4242 4242 4242 4242`. El listener muestra `[200] POST …/api/webhooks/stripe` para `payment_intent.succeeded`, y en la DB se cumple AC2 (`select count(*) from ticket t join order_item oi on oi.id = t.order_item_id where oi.order_id = …` = número de entradas).
5. Pagar primero con `4000 0000 0000 0002`: llega `payment_intent.payment_failed` con 200 y la orden sigue `pending`. Luego pagar con `4242…`: se convierte (AC7).
6. Reenviar el evento del paso 4: `stripe events resend <evt_id>`. Responde 200 y el conteo de tickets, `sold_count` y los asientos no cambian (AC3). El developer confirma que su versión del CLI entrega el reenvío al listener local; si no, lo reporta en "Bloqueos" y AC3 queda cubierto por el test.
7. `stripe trigger payment_intent.succeeded` → 200 con el aviso de PI desconocido (AC8).
8. Hold perdido (AC6):
   - pagar con la tarjeta 3DS `4000 0027 6000 3184` y, con el modal abierto, ir en otra pestaña a `/events/<slug>/tickets` y pulsar "Continuar" (D3 de 05 libera la reserva anterior);
   - completar el 3DS → reembolso visible en el Dashboard (con reversión de la transferencia), orden `cancelled` y sin tickets.
   - Para AC5: con el modal abierto, poner `expires_at` en el pasado por SQL sin que nadie reserve, y completar → conversión normal.

## Tests requeridos

(Vitest, junto al archivo. Como en 07 y 05, el SQL de los services de datos (`payment-fulfillment-service.ts`, `stripe-event-service.ts`) y el gateway real no tienen unit tests: se verifican con AC2 a AC6, la "Prueba local" y la revisión contra "Batch de conversión".)

- `src/modules/payment/payment.utils.test.ts` (ampliado):
  - `routeSucceededPayment`: la tabla completa de D4:
    - `paid`, `partially_refunded` y `refunded` → `alreadyPaid`, con cualquier reserva;
    - `pending` + `active` → `fulfill`;
    - `pending` + `expired`/`released`/`converted`/`null` → `refund`;
    - `failed`/`cancelled` + `active` → `refund`.
  - `isGuardAbort`: `22012` y `23514` → `true`, también envueltos en `cause`; `23505`, sin código y `null` → `false`.
  - `PAYMENT_EVENT_TYPES`: los dos tipos exactos.
  - Siguen intactos los casos de `mapTransfersStatus`, `calculatePlatformFeeCents`, `mapPaymentIntentStatus`, `toPaymentIntentParams`, `amountToCents` y `resolveConfirmation`.
- `src/modules/payment/ticket.utils.test.ts`:
  - `generateTicketCode` con un `randomBytes` inyectado (bytes fijos) devuelve el base64url esperado y pide exactamente 16 bytes;
  - con el generador real: 22 caracteres de `[A-Za-z0-9_-]`, y 1.000 códigos sin repetidos;
  - `toNewTickets`: un ticket por id, en el mismo orden, con `eventId` y `holderName`, y un `generateCode` inyectado (contador) para cada uno; lista vacía → `[]`.
- `src/modules/payment/services/payment-webhook-service.test.ts`. Mocks:
  - `vi.mock` de `payment-fulfillment-service` y de `stripe-event-service`;
  - mock vacío de `stripe-payment-gateway` (el real carga el SDK);
  - gateway falso `satisfies PaymentWebhookGateway`;
  - `ticket.utils` real.

  Casos:
  - sin firma → 400 y `parseWebhook` no se llama;
  - `WebhookSignatureError` → 400 sin llamadas a la DB;
  - `Error` de configuración en `parseWebhook` → 500;
  - tipo irrelevante (`charge.succeeded`) → 200 sin DB y sin registrar;
  - `payment_intent.payment_failed` → 200; no se llaman `findPaymentContext`, `fulfillOrder`, `cancelRefundedOrder` ni `markStripeEventProcessed` (D9);
  - evento ya procesado → 200 sin `findPaymentContext`;
  - PI desconocido (`findPaymentContext` → `null`) → 200, se registra y no se llaman `fulfillOrder` ni `refundPayment`;
  - camino feliz: `fulfillOrder` se llama una vez con `stripeEvent`, `paymentId`, `orderId`, `reservationId`, `chargeId` y un ticket por `orderItemId` (`holderName = buyerName`, códigos distintos). `markStripeEventProcessed` **no** se llama (el evento va en el batch) y responde 200;
  - **Listo cuando, entrega doble (fake con estado)**:
    - un `Set` de eventos procesados y el estado de la orden en memoria;
    - `fulfillOrder` lanza `{ code: "23505" }` si el evento ya está, `{ code: "22012" }` si la orden no está `pending`, y si no, la pasa a `paid`, registra el evento y acumula los tickets;
    - `findPaymentContext` refleja el estado actual;
    - entregar el mismo evento dos veces → `fulfillOrder` exitoso una sola vez, tickets emitidos = ítems de la orden, la segunda respuesta es 200 y no se llama `refundPayment`;
  - entrega concurrente (`Promise.all` de dos entregas del mismo evento con `hasProcessedStripeEvent` → `false` para ambas) → una conversión, la otra 200 tras releer, tickets una sola vez y sin reembolso;
  - evento distinto del mismo PI con la orden ya `paid` → `alreadyPaid`, se registra y no hay `fulfillOrder`;
  - reserva `expired` en la pre-lectura:
    - `refundPayment(pi, "refund:<orderId>")` se llama **antes** que `cancelRefundedOrder`;
    - después se registra el evento y responde 200;
    - no se llama `fulfillOrder`;
  - `fulfillOrder` lanza `22012`:
    - si el releído muestra `paid` → 200 sin reembolso;
    - si el releído muestra la reserva `released` → reembolso + cancelación + 200;
    - si el releído sigue `pending` + `active` → `console.error` + reembolso + cancelación + 200;
  - `fulfillOrder` lanza `23505` y el releído sigue `pending` + `active` → 500, sin reembolso y sin registrar;
  - error de DB no clasificado en `fulfillOrder` → 500, sin registrar y sin reembolso;
  - `refundPayment` falla → 500 sin `cancelRefundedOrder` ni registro. El reintento llama de nuevo a `refundPayment` con **la misma clave**, cancela, registra y responde 200;
  - orden `cancelled` en la pre-lectura → reembolso + `cancelRefundedOrder` + registro + 200.
- Sin unit tests para `stripe-payment-gateway.ts`, `payment-fulfillment-service.ts`, `stripe-event-service.ts` ni `route.ts`.

## Tareas

### T1: Núcleo puro, códigos de entrada y gateway de Stripe

- Archivos: `src/modules/payment/payment.types.ts`, `src/modules/payment/payment.utils.ts`, `src/modules/payment/payment.utils.test.ts`, `src/modules/payment/ticket.utils.ts`, `src/modules/payment/ticket.utils.test.ts`, `src/modules/payment/services/stripe-payment-gateway.ts`
- Depende de: —
- Paralelizable: sí (con T2: archivos disjuntos y sin imports entre sí)
- Cubre: AC1 (`parseWebhook`), AC6 (`refundPayment`), AC11, AC12, AC13
- Notas:
  - `parseWebhook` lee `process.env.STRIPE_WEBHOOK_SECRET` (`throw new Error("STRIPE_WEBHOOK_SECRET is not set.")` si falta) y usa `getStripeClient().webhooks.constructEvent`.
  - `StripeSignatureVerificationError` → `WebhookSignatureError`.
  - `refundPayment` mapea solo `charge_already_refunded` a `{ refundId: null }`; todo otro error se propaga.
  - El developer confirma en los tipos instalados cómo estrechar `event.data.object` a `PaymentIntent`.

### T2: Capa de datos de la conversión e idempotencia en el batch

- Archivos: `src/modules/payment/services/payment-fulfillment-service.ts`, `src/modules/payment/services/stripe-event-service.ts`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC2, AC3 (guardas), AC4, AC5, AC6 (`cancelRefundedOrder`), AC12
- Notas:
  - `fulfillOrder` implementa S1–S7 de "Batch de conversión" tal cual (orden, guardas `1 / (count(*) = n)::int`, `updated_at = now()` a mano en SQL crudo).
  - `findPaymentContext` hace dos lecturas: la fila de contexto y los ids de `order_item` ordenados por `id`.
  - `markStripeEventProcessed` mantiene su comportamiento (Connect lo usa).
  - Los tipos de T2 se infieren del esquema (no importa `payment.types.ts`).

### T3: Handler del webhook de pagos y ruta

- Archivos: `src/modules/payment/services/payment-webhook-service.ts`, `src/modules/payment/services/payment-webhook-service.test.ts`, `src/app/api/webhooks/stripe/route.ts`
- Depende de: T1, T2
- Paralelizable: no (ola 2, sola: importa de T1 y T2)
- Cubre: AC1, AC3, AC4, AC6, AC7, AC8, AC9, AC10, AC12, AC13
- Notas:
  - implementa "Flujo de `handlePaymentWebhook`" y las tablas de D4 y D7;
  - la ruta replica `webhooks/stripe-connect/route.ts`;
  - antes de escribirla, el developer lee la sección "Webhooks" de `route.md` (Next 16).

Olas:

- **Ola 1** = T1 ∥ T2 (archivos disjuntos; T2 no importa nada de T1 y viceversa; los contratos están fijados arriba).
- **Ola 2** = T3.

**Paralelizables: T1 y T2.**

## Preguntas abiertas

Cada pregunta trae un valor por defecto: si no hay respuesta, se aplica ese valor.

1. **`payment_intent.payment_failed` frente al reintento sobre el mismo PI.** *Contradice el texto de la tarjeta* ("orden `failed` y liberar inventario") *y `system-design.md §5.1` paso 4* ("Pago fallido: `orders.failed` … y se libera el inventario"; los docs de arquitectura no se modifican).
   - **Por defecto: solo `console.info` y 200, sin tocar la DB** (D9). El evento llega en cada tarjeta rechazada, pero el PI sigue abierto y el comprador reintenta sobre él (D5 paso 5 de 07). Con `failed`:
     - el reintento respondería `orderClosed` (`checkout-service.ts:63`);
     - liberar el inventario dejaría un PI cobrable sin hold.
   - Marcar solo `payment.failed` no bloquea la reanudación (nadie lee `payment.status`), pero hace que la guarda `payment.status='pending'` del batch aborte cuando el reintento sí pague. Además, no tiene consumidor (YAGNI).
   - **`payment_intent.canceled`** (terminal): **por defecto queda para la tarjeta 10** y aquí se ignora con 200.
     - Hoy nada en la app cancela PaymentIntents. Solo un cancel manual desde el Dashboard lo dispararía, y entonces la orden queda `pending` sin consecuencias de inventario (la reserva vence y el barrido o la 10 la liberan).
     - La 10 es la que cancelará PIs huérfanos y actualizará sus órdenes en el mismo flujo.
     - Alternativa: manejarlo aquí, con orden `cancelled` y `payment.failed` `WHERE status='pending'`, registro del evento y sin liberar inventario. Liberarlo exigiría un helper nuevo, porque el barrido de 05 es privado y está pensado por usuario y evento.
2. **Hold perdido antes del webhook: convertibilidad, reembolso y estado final.**
   - Convertibilidad (D6): reserva `active` (aunque esté vencida) con su inventario intacto → se convierte. `expired`/`released`/sin reserva, orden `failed`/`cancelled`, o guarda de inventario fallida → camino de reembolso.
   - **Por defecto**:
     - reembolso **automático** (lo pide el contrato aprobado de 07, carrera (a)): `refunds.create` primero, con `idempotencyKey = "refund:<orderId>"`, `reverse_transfer: true` y `refund_application_fee: true` (el organizador y la plataforma devuelven su parte y la plataforma asume la comisión de procesamiento de Stripe);
     - después, `payment.succeeded` + `stripe_charge_id`, `orders.cancelled` (con guarda `pending`) y el `refundId` en el log;
     - **sin fila `refund`**: `refund_reason` (`customer_request|event_cancelled|admin`) no tiene un valor que corresponda, y `§5.4` asocia `refunded` a `refund` + `refund_ticket`. Por eso la orden queda `cancelled` y no `refunded`.
   - Alternativas:
     - (b) crear la fila `refund` (`reason='admin'`, `status='pending'`, `stripe_refund_id`, `requested_by` NULL) y dejar la orden `refunded`; la 12 la cerraría con `charge.refunded`;
     - (c) agregar un valor de `refund_reason` (p. ej. `hold_expired`), lo que obliga a una migración (T0);
     - (d) no reembolsar automáticamente: orden `cancelled` y reembolso manual desde el Dashboard.
   - Sub-pregunta, inventario desajustado con la reserva `active` (D7): **por defecto se reembolsa** con `console.error`. Alternativa: responder 500 para forzar atención humana, pero Stripe reintenta 3 días con el comprador cobrado y sin entradas.
3. **Formato de `ticket.code`.** **Por defecto: 128 bits (`randomBytes(16)`) en base64url, 22 caracteres**, en `ticket.utils.ts` (D11), sin extraer un generador a `src/lib`. `holder_name = orders.buyer_name`.
   - Alternativa: Crockford base32 en mayúsculas (26 caracteres), que permite el modo alfanumérico del QR y es más fácil de dictar, a cambio de un código más largo.
   - El check-in (`§5.3`) compara `code` exacto: base64url distingue mayúsculas de minúsculas.
4. **Confirmación local transitoria (D15 de 07).** **Por defecto: queda igual hasta la 09.** Tras pagar, el comprador sigue viendo la confirmación generada en el navegador aunque la orden real ya esté `paid` (o `cancelled` si hubo reembolso). Mostrar el estado real y "Mis entradas" desde `ticket` es de la 09.
5. **PI desconocido (sin fila `payment`).** **Por defecto: `console.warn` con el id, registrar el evento y 200.** Así `stripe trigger` y los PI ajenos a la app (otras integraciones en la misma cuenta) no generan 500 ni reintentos. Un PI confirmado de esta app siempre tiene su `payment`: 07 solo entrega el `client_secret` después de insertarlo (`payment-service.ts:31-39`).
6. **`stripe_event` dentro del batch frente a check-then-act más guardas.** **Por defecto: dentro del batch** (D10), como primera sentencia y sin `ON CONFLICT`, con `hasProcessedStripeEvent` como camino rápido y las guardas como garantía real (en especial `orders.status='pending'`, que cubre también eventos distintos del mismo PI).
   - Ventajas: el registro es atómico con la conversión y la entrega gemela aborta antes de tomar locks de inventario.
   - Costos: un builder nuevo en `stripe-event-service.ts` y un código más (`23505`) que clasificar.
   - Alternativa: dejar `stripe-event-service.ts` intacto y registrar después del commit, como Connect. También es correcto gracias a las guardas: si el registro falla, el reintento ve la orden `paid` y la registra.
7. **Endpoint de producción y versión de API.** **Por defecto: fuera de alcance.** El humano crea en el Dashboard un destino **snapshot** hacia `https://<dominio>/api/webhooks/stripe`, con los eventos `payment_intent.succeeded` y `payment_intent.payment_failed` y la versión de API del SDK (`stripe@23.0.0`), y guarda su `whsec_…` como `STRIPE_WEBHOOK_SECRET` del entorno. En local basta con `stripe listen` (Prueba local).

## Próximas fases

- **Tarjeta 09**: confirmación y "Mis entradas" desde `orders`/`ticket` reales, QR con `ticket.code` y retiro de la confirmación local (Pregunta 4).
- **Tarjeta 10**: job `/api/jobs/release-holds`, cancelación de órdenes `pending` huérfanas y de sus PaymentIntents, y `payment_intent.canceled` (Pregunta 1).
- **Tarjeta 12**: `charge.refunded`/`refund.updated`, filas `refund`/`refund_ticket` y conciliación de los reembolsos automáticos de D8 (Pregunta 2).
- Correo de confirmación con las entradas.
- Registro del endpoint de producción en Stripe (Pregunta 7).
