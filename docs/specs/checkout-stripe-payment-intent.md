# Checkout con Stripe: orden pendiente y PaymentIntent (solo tarjeta, Payment Element embebido)

Estado: aprobada

## Objetivo

Hoy el checkout simula el pago en el navegador (`CheckoutForm` valida una tarjeta falsa y llama `confirmOrder`, que solo escribe en `localStorage`) y ofrece Yape y PagoEfectivo, que el diseño descarta (`system-design.md §6`: "Yape/PagoEfectivo: hay que quitarlos de la UI al implementar (solo tarjeta)"). Esta spec (tarjeta Trello "07 · Checkout con Stripe (PaymentIntent, solo tarjeta)") hace que el checkout:

1. cree en el servidor una orden `pending` (+ `order_item`) a partir de la reserva activa (tarjeta 05), con el snapshot del comprador y `terms_accepted_at`;
2. cree un PaymentIntent de destination charge con `application_fee_amount` (comisión leída de `platform_setting.platform_fee_percent`) y `transfer_data.destination` = cuenta Connect del organizador (tarjeta 06), y su fila `payment` `pending`;
3. muestre el **Stripe Payment Element dentro de nuestra página** (sin redirigir a Stripe Checkout), solo con tarjeta;
4. precargue en el formulario los datos que el `user` ya tiene.

**Listo cuando** un pago con tarjeta de prueba deja la orden `pending` con su `payment` creado (la 08 la pasa a `paid`).

Referencias (consultar solo estas secciones):

- `system-design.md §5.1`, paso 2: "Checkout: se crea `orders` `pending` con snapshot del comprador y un PaymentIntent de Stripe con `application_fee_amount` y `transfer_data.destination = organizer.stripe_account_id`." Pasos 3 y 4 son de la tarjeta 08.
- `system-design.md §2` (Pagos: "Solo tarjeta vía Stripe, con Stripe Connect (comisión de plataforma y neto al organizador)"), §3 "Reglas de límite" (solo `payment` habla con Stripe; una Server Action valida, autoriza y llama a un service) y §6 ("Comisión: vive en `platform_setting` (`platform_fee_percent`) y se copia a `orders.platform_fee_cents` al cobrar", "Checkout con sesión").
- `erd.md §3`, grupo **Compra y pago**: `orders`, `order_item`, `payment`, `stripe_event`. `erd.md §4` ("Un ticket por ítem": un `order_item` por entrada; `stripe_payment_intent_id` UQ).
- Specs en las que se apoya: `reservation-hold.md` (`getActiveReservation`, reserva viva, 10 min), `organizer-stripe-connect.md` (`stripe_onboarding_status = 'complete'`, módulo `payment`, `stripe-event-service.ts`), `ticket-selection-redesign.md` (estilo y asteriscos del checkout).

### Hechos verificados (repo y docs, 2026-10-09)

- **No hay nada del pago real todavía.** Ningún código escribe en `orders`, `order_item` ni `payment` (solo existen las tablas en `src/db/schema/order.ts`). `platform_setting` existe (`identity.ts:42`, `key` PK, `value` jsonb) pero **nadie la lee ni la siembra**: `src/db/seed.ts` no la toca y ninguna migración inserta filas. Hay que sembrar `platform_fee_percent` (T0).
- **`orders`/`payment` no tienen columna `currency`.** La moneda de una orden es la de su evento (`event.currency`, default `PEN`). Se documenta; no se agrega columna.
- **`orders.reservation_id` solo tiene un índice normal** (`order.ts:44`), no único. La idempotencia "una reserva = una orden" necesita un índice único (T0). No figura en `erd.md §5`: se reporta (Pregunta 12).
- **`payment_status`** = `pending | succeeded | failed`; **`order_status`** = `pending | paid | failed | cancelled | partially_refunded | refunded` (`enums.ts`). No hace falta tocar enums.
- **Tipos de documento: UI y DB no coinciden.** La DB usa `dni | ce | passport` (`user.document_type`, `orders.buyer_document_type`); `checkout.schema.ts` y `CheckoutForm` usan `"DNI" | "CE" | "Pasaporte"`. `user` ya tiene `phone`, `document_type` y `document_number` (`identity.ts:18-20`), `full_name` y `email`.
- **Stripe ya está instalado en el servidor**: `stripe@23.0.0` (API `2026-09-30.endive`), con `stripe-client.ts` (`getStripeClient()`, `server-only`, única lectura de `STRIPE_SECRET_KEY`) y `stripe-connect-gateway.ts` (de 06). `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` **ya está** en `.env.example:19`. **Faltan** `@stripe/stripe-js` (10.0.0) y `@stripe/react-stripe-js` (7.0.0; peers `react >=16.8 <20`, `@stripe/stripe-js >=10 <11`), compatibles con React 19.2.
- **Flujo del Payment Element sin PaymentIntent previo** ("deferred intent", `docs.stripe.com/payments/accept-a-payment-deferred`): `Elements` se monta con `mode: 'payment'`, `amount` y `currency`; al pagar se llama `elements.submit()`, luego el servidor crea el PaymentIntent y devuelve el `client_secret`, y `stripe.confirmPayment({ elements, clientSecret, confirmParams: { return_url } })` confirma. Con `redirect: 'if_required'` los pagos con tarjeta no redirigen (3DS se resuelve en un modal). Las opciones de `Elements` (`captureMethod`, `paymentMethodOptions`, tipos de pago) deben coincidir con el PaymentIntent. La opción para restringir métodos se llama `allowedPaymentMethodTypes` en la tabla de la doc; el nombre exacto en `@stripe/stripe-js@10` lo confirma el developer en los tipos instalados.
- **Destination charge** (`docs.stripe.com/connect/destination-charges`): con `application_fee_amount`, el cargo completo se transfiere a `transfer_data[destination]` y la comisión vuelve a la plataforma; la comisión va **en la moneda de la transacción** y liquida en la moneda de liquidación de la cuenta conectada; la plataforma paga las comisiones de Stripe de su parte. Los *thin events* v2 de cuentas no intervienen aquí.
- **Gate de Connect: la tarjeta pide `charges_enabled`, pero 06 lo descarta.** La cuenta conectada es v2 con configuración `recipient` y solo la capability `stripe_transfers` (`organizer-stripe-connect.md`, AC7: "ningún código usa `charges_enabled` ni `payouts_enabled`"). En un destination charge la plataforma es la que cobra y la cuenta conectada solo recibe la transferencia, así que el gate correcto es `organizer.stripe_onboarding_status = 'complete'` (⇔ `stripe_transfers` activo) y `stripe_account_id` no nulo. Discrepancia con la tarjeta, reportada en Pregunta 4.
- **Precio estable durante el hold.** `event-write-service.ts:321-332` solo deja cambiar `price_cents` de una zona con ocupación 0 (cuenta `held`). El precio de `event_zone` no cambia mientras hay una reserva viva, así que calcular el importe al crear la orden coincide con lo que la página mostró.
- **Neon HTTP**: sin transacciones interactivas; `db.batch` es una transacción no interactiva que revierte si alguna sentencia **lanza** (`reservation-hold.md`, "Hechos verificados"). Un `INSERT` con violación de UNIQUE lanza → revierte el batch completo.
- **Next 16**: Server Functions que usa un Client Component se importan desde un archivo con `'use server'` arriba (`01-app/03-api-reference/01-directives/use-server.md`); es el patrón de `booking/actions.ts` y `payment/actions.ts`.

## Decisiones

Derivadas en esta spec, con su justificación:

- **D1: Deferred intent, orden y PaymentIntent al pulsar "Pagar" (no al cargar la página).** Se mantiene el layout de una sola página (datos del comprador + pago + términos). El Payment Element se monta de inmediato con `amount` y `currency`; la orden y el PaymentIntent nacen en el submit, así que quien abre el checkout y se va no deja órdenes huérfanas. Se descarta el flujo de dos pasos ("Continuar al pago" → montar el Element con un `client_secret`), que obliga a rediseñar el formulario.
- **D2: Una sola Server Action `startCheckoutAction(input)`; el cliente no envía importes ni ids de reserva.** Recibe `{ slug, fullName, email, documentType, documentNumber, phone, acceptTerms }`. La reserva se resuelve en el servidor con la sesión (`getLiveReservationForOrder(user.id, event.id)`), y el importe sale de `reservation_item ⨝ event_zone.price_cents`. Nunca se confía en un total del cliente. El `amount` de `Elements` en el navegador es solo para la UI de Stripe: `Math.round(getOrderTotals(lines).total * 100)` (`amountToCents`); coincide con el servidor porque ambos salen de los mismos `price_cents`, salvo carrera (Pregunta 7). No se toca `ActiveReservation` (archivo de 05) para agregarle `totalCents`.
- **D3: La comisión la absorbe el organizador (el comprador paga el subtotal).** `subtotal_cents = Σ unit_price_cents`, `platform_fee_cents = round(subtotal × percent / 100)`, `total_cents = subtotal_cents`; el PaymentIntent cobra `total_cents` y `application_fee_amount = platform_fee_cents` (solo si > 0). Es lo coherente con `system-design §2` ("comisión de plataforma y neto al organizador"), no cambia el total que ve el comprador (la UI no tiene línea de comisión) y permite que el cliente conozca el `amount` de `Elements` sin saber el porcentaje. Pregunta 2.
- **D4: Moneda = la del evento (ver Pregunta 1, ASUMIDA hasta respuesta).** El PaymentIntent y `Elements` usan `event.currency.toLowerCase()` (`pen`) con los céntimos tal cual salen de la DB: **sin conversión en código** ni columna `currency`. Se asume moneda de dos decimales (`system-design §2` fija `PEN`).
- **D5: Idempotencia por reserva.** Una reserva tiene como máximo una orden (índice único `orders.reservation_id`, T0) y una orden como máximo un `payment` (`payment.order_id` UQ y `stripe_payment_intent_id` UQ ya existen). Orden de escritura:
  1. Resolver sesión, evento, reserva viva, cuenta de destino y porcentaje de comisión (todo lectura; cualquier fallo aquí no escribe nada).
  2. Buscar la orden de esa reserva. Si no existe: `db.batch([insert orders, insert order_item…])` con `id` y `code` generados en la app. Si el `INSERT` viola el UNIQUE de `reservation_id` (otra pestaña llegó primero), el batch revierte y se **relee** la orden existente.
  3. Crear el PaymentIntent con `idempotencyKey = "payment-intent:<orderId>"` (la misma orden siempre devuelve el mismo PaymentIntent, aunque falle la escritura siguiente).
  4. `INSERT payment … ON CONFLICT (order_id) DO NOTHING` y releer. Si (3) o (4) fallan, el reintento encuentra la orden, repite (3) con la misma clave y completa (4).
  5. Con orden y `payment` ya existentes (reintento tras un rechazo, doble clic, otra pestaña): **no se crea nada**; se hace `paymentIntents.retrieve` para obtener el `client_secret` (no se guarda en la DB) y su estado.
- **D6: Reintentos con datos corregidos.** Mientras la orden esté `pending`, cada llamada actualiza el snapshot del comprador (`buyer_*`, `terms_accepted_at` no cambia). Sin esto, un correo mal tipeado en el primer intento quedaría fijo. Los importes **no** se recalculan: se reutilizan los de la orden.
- **D7: Una orden que ya no es `pending` no se reintenta.** Si la orden de la reserva está `paid`, `failed` o `cancelled`, la action responde `orderClosed` y el usuario vuelve a elegir entradas. El PaymentIntent en estado `succeeded`/`processing` se devuelve como tal (el cliente va a la confirmación sin volver a confirmar).
- **D8: La reserva debe estar viva al crear/reanudar el pago** (`status = 'active' AND expires_at > now()`, reloj de la DB), reusando la misma condición que `getActiveReservation`. No se agrega margen. **Un PaymentIntent confirmado después de que el hold venza no lo resuelve esta tarjeta**: es el contrato con la 08 (ver abajo).
- **D9: Gate de Connect solo con datos de la DB.** Antes de escribir nada: el organizador del evento debe tener `stripe_account_id` y `stripe_onboarding_status = 'complete'`; si no, `payoutsUnavailable`. No se vuelve a leer Stripe. Si aun así Stripe rechaza el destino al crear el PaymentIntent, el error se loguea y el usuario ve el mensaje genérico (Pregunta 4).
- **D10: La comisión se lee de `platform_setting` sin valor por defecto en código.** `platform_fee_percent` (jsonb number, 0 a 100, admite decimales) se valida con zod. Si falta la fila o es inválida, la action falla con mensaje genérico y log, **sin crear la orden**. El valor por defecto es la **fila sembrada por la migración** (T0), no una constante en código. El `value` es un número de porcentaje (`10` = 10 %), no una fracción.
- **D11: `code` del pedido.** `TK-` + 8 caracteres del alfabeto Crockford base32 sin ambiguos (p. ej. `TK-7H3KQ9XM`), generado con `crypto`. Reemplaza el `createOrderId` falso del cliente (5 dígitos, ~90 mil combinaciones, inviable como UQ real). Nada aguas abajo asume el formato viejo: `ticket-export.ts:21` solo usa los dígitos del `id` como semilla decorativa del QR (`|| 1` si no hay), y el resto lo muestra tal cual. En la rara colisión (`23505` sobre `code`), la orden no se encuentra al releer por reserva y se responde `generic` (el usuario reintenta); no hay bucle de reintento (YAGNI).
- **D12: `order_item` = una fila por entrada.** Un ítem GA con `quantity = n` genera `n` filas con `event_seat_id` NULL; un asiento, una fila con su `event_seat_id`. `unit_price_cents` = `event_zone.price_cents` al crear la orden.
- **D13: Solo tarjeta, explícito en ambos lados.** `payment_method_types: ["card"]` en el PaymentIntent y la opción equivalente en `Elements`. Sin `on_behalf_of`. El nombre, el correo y el celular los captura nuestro formulario: el Payment Element se monta con `fields.billingDetails` en `never` para nombre, correo y teléfono, y esos datos se pasan en `confirmParams.payment_method_data.billing_details` (el developer confirma la forma en los tipos).
- **D14: `return_url` = `${window.location.origin}/events/<slug>/confirmation`** con `redirect: 'if_required'`. La página de confirmación ignora de momento `payment_intent`/`redirect_status`.
- **D15: La confirmación sigue siendo la local (transitoria) hasta la 08.** Tras `confirmPayment` con `succeeded`/`processing`, el cliente llama `confirmOrder({ eventId, lines, currency, method: "card", buyerName, email }, orderCode)` (el `code` real como `id`) y navega a `/confirmation`, como hoy. La página muestra entradas generadas en el cliente y "Mis entradas" sigue siendo el mock: reemplazarlos con datos reales (orden `paid`, `ticket`) es de la 08/09. La orden en la DB sigue `pending` hasta el webhook (Pregunta 6).
- **D16: `PaymentMethodPicker.tsx` se elimina.** Con una sola opción un grupo de radios no tiene sentido; el Payment Element ya presenta el método. `PaymentMethod` se estrecha a `"card"` (se conserva el campo `Order.method`, para no cambiar la forma de `Order`).
- **D17: el schema del comprador pasa a un archivo nuevo, `buyer.schema.ts`, y `checkout.schema.ts` se elimina en T4.** El nuevo conserva la lógica del comprador y los términos (`buyerSchema`, `getBuyerErrors`) y pierde todo lo de tarjeta (`cardSchema`, `paymentSchema`, `isValidExpiry`, campos `card*` y `method`): la tarjeta la valida Stripe. Sus `DOCUMENT_TYPES` son los de la DB (`dni | ce | passport`), con `DOCUMENT_TYPE_LABELS` para la UI (`DNI`, `CE`, `Pasaporte`): no hay mapeo ida y vuelta entre UI y DB. Se hace en un archivo nuevo (y no reescribiendo `checkout.schema.ts` en T1) para que `CheckoutForm.tsx`, que sigue importando el viejo, compile en cada ola hasta que T4 lo cambie y borre el original.
- **D18: Precarga.** La página pasa `buyerDefaults` calculado desde el `user` de la sesión (nombre, correo, documento, celular), con `toBuyerDefaults(user)` (puro y testeado). La tarjeta pide teléfono y documento; el nombre y el correo se precargan también porque van en la misma prop y hoy el formulario los pide vacíos. No se escribe nada de vuelta en `user` (Pregunta 10).
- **D19: El módulo `payment` sigue siendo el único que habla con Stripe.** Servidor: `stripe-payment-gateway.ts` (nuevo, detrás de la interfaz `PaymentGateway`) reutiliza `getStripeClient()`; no hay otro cliente. Navegador: `@stripe/stripe-js` y `@stripe/react-stripe-js` solo se importan en `src/modules/payment/components` y `src/modules/payment/hooks`. `booking` no importa `stripe` ni `@stripe/*`; solo llama a funciones exportadas por `payment`, y el hook de `payment` recibe `startCheckout` por parámetro (así `payment` no importa nada de `booking`).

### Contrato con la tarjeta 08 (webhook de pagos)

Lo que la 07 deja escrito y la 08 puede asumir:

- **`orders`**: `status = 'pending'`, `reservation_id` = reserva `active` en ese momento, `subtotal_cents = total_cents`, `platform_fee_cents`, snapshot del comprador, `terms_accepted_at`, `paid_at` NULL. Un `order_item` por entrada.
- **`payment`**: **una fila por orden**, `status = 'pending'`, `stripe_payment_intent_id` (UQ), `stripe_charge_id` NULL, `amount_cents = total_cents`, `application_fee_cents = platform_fee_cents`, `destination_account_id = organizer.stripe_account_id`.
- **PaymentIntent**: `amount = total_cents`, `currency = event.currency` en minúscula, `application_fee_amount` (si > 0), `transfer_data.destination`, `payment_method_types = ["card"]` y **metadata** `{ order_id, order_code, reservation_id, event_id, user_id }` (solo ids internos, sin datos personales). La 08 empareja por `payment.stripe_payment_intent_id` (autoritativo); la metadata es para reconciliar y depurar.
- **Lo que debe hacer la 08** (fuera de esta spec): `payment.succeeded` + `stripe_charge_id`, `orders.paid` + `paid_at`, conversión de la reserva e inventario (§5.1 paso 3), `ticket` por `order_item`, `failed`/`cancelled` (§5.1 paso 4), idempotencia con el `stripe-event-service.ts` existente, y el endpoint `/api/webhooks/stripe` con `STRIPE_WEBHOOK_SECRET`.
- **Carreras que la 07 NO cierra** y la 08 debe contemplar: (a) un PaymentIntent confirmado cuando su reserva ya venció o fue reemplazada (D3 de 05): al recibir `payment_intent.succeeded` la 08 debe verificar que la reserva sigue `active`/`converted` y, si no, reembolsar y marcar la orden; (b) órdenes `pending` huérfanas (reserva reemplazada o vencida) cuyo PaymentIntent sigue abierto: cancelarlos y pasar la orden a `cancelled` es de la 08/10.

## Alcance

- Incluye:
  - **Base (T0)**: dependencias `@stripe/stripe-js` y `@stripe/react-stripe-js` (versiones exactas); índice único `orders.reservation_id` (sustituye al índice normal); migración `0003` que además siembra `platform_setting.platform_fee_percent`.
  - **Núcleo puro (T1)**:
    - `buyer.schema.ts` (nuevo, D17): comprador + términos sin tarjeta, `DOCUMENT_TYPES` de la DB, `DOCUMENT_TYPE_LABELS`, `getBuyerErrors`/`BuyerField` y `startCheckoutSchema` (`slug` + comprador).
    - `checkout.types.ts`: contrato de cable (`StartCheckoutResult`, `BuyerDefaults`) y filas (`OrderItemSource`, `NewOrderItem`, `OrderAmounts`).
    - `checkout.utils.ts`: `CHECKOUT_MESSAGES`, `generateOrderCode`, `toOrderItems`, `calculateOrderAmounts`, `toBuyerDefaults`.
    - `payment.types.ts`/`payment.utils.ts`: `PaymentGateway`, `PaymentIntentState`, `PreparedPayment`, `PaymentIntentParams`; `calculatePlatformFeeCents`, `mapPaymentIntentStatus`, `toPaymentIntentParams`, `amountToCents`, `resolveConfirmation`, `PAYMENT_MESSAGES`.
    - `payment.schema.ts`: `platformFeePercentSchema`.
  - **Módulo `payment` (T2)**:
    - `services/stripe-payment-gateway.ts`: `createPaymentIntent` y `retrievePaymentIntent` sobre `getStripeClient()`.
    - `services/payment-record-service.ts` (DB): `findPaymentByOrderId`, `insertPayment` (`ON CONFLICT (order_id) DO NOTHING`).
    - `services/payment-service.ts`: `preparePayment` (D5, pasos 3 a 5), idempotente.
    - `services/platform-fee-service.ts`: `getPlatformFeePercent()` (D10).
    - `components/CardPaymentProvider.tsx` (`loadStripe` + `Elements` + `PaymentElement` solo tarjeta) y `hooks/use-checkout-payment.ts` (`elements.submit()` → `startCheckout()` → `confirmPayment`).
  - **Servidor de `booking` (T3)**:
    - `getLiveReservationForOrder` en `reservation-service.ts`;
    - `services/checkout-data-service.ts` (DB): `findPayoutAccount`, `findOrderByReservation`, `createPendingOrder`, `updateBuyerSnapshot`;
    - `services/checkout-service.ts`: `startCheckout` (orquesta D5);
    - `startCheckoutAction` en `actions.ts`.
  - **UI y limpieza (T4)**: `CheckoutForm.tsx` con el Payment Element, sin tarjeta manual ni Yape/PagoEfectivo; página de checkout con `buyerDefaults`; eliminar `PaymentMethodPicker.tsx`; estrechar `PaymentMethod` a `"card"`.
- No incluye:
  - **Tarjeta 08**: webhook `/api/webhooks/stripe`, `orders.paid`, conversión de la reserva y del inventario, emisión de `ticket`, correo.
  - **Tarjeta 15**: UI de ajustes de comisión (solo se **lee** `platform_setting`; nadie la escribe).
  - **Tarjeta 10** y limpieza de órdenes/PaymentIntents huérfanos o vencidos.
  - Reemplazar la confirmación local ni "Mis entradas" por datos reales (08/09).
  - Entradas gratuitas (total 0): la action responde `nothingToPay`; Stripe no cobra importes en 0.
  - Otros métodos de pago, guardar tarjetas (`setup_future_usage`), `receipt_email`, Apple/Google Pay explícitos, Link, `on_behalf_of`, FX Quotes API, columna `currency` en `orders`/`payment`.
  - Escribir teléfono/documento de vuelta en `user`.
  - Cambios en `src/proxy.ts`, `current-user.ts`, `next.config.ts`, `docs/architecture/*`, `.env.example` (no hay variables nuevas: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` ya existe; nadie toca `.env`), `reservation.*`, `reserveTicketsAction`, `booking.store.ts`, `ReservationTimer.tsx`, `CheckoutSummary.tsx`, `OrderConfirmation.tsx`, la página de confirmación ni el webhook de Connect.

## Reutilizar

- **`src/modules/payment`**: `getStripeClient()` (`stripe-client.ts`) para el cliente de Stripe; patrón de gateway inyectable y de test con `vi.mock` de la capa de datos de `connect-service.ts`/`connect-service.test.ts`; `payment.types.ts`/`payment.utils.ts` (se extienden); `actions.ts` queda como está; `stripe-event-service.ts` queda intacto para la 08. No se crea otro cliente Stripe ni otra instancia de `Stripe`.
- **`reservation-service.ts` (05)**: la condición de reserva viva de `getActiveReservation` (`status='active' AND expires_at > now()`, `desc(createdAt)`) y sus tablas; `getLiveReservationForOrder` se agrega **junto a ella** y no cambia `getActiveReservation`.
- **`getPublicEventDetail(slug)`** (`event-public-service.ts`): evento visible y su `currency`, igual que `reserveTicketsAction`.
- **`requireRole("customer")`** (`current-user.ts`): sesión y `UserRecord` (la página ya lo llama; la action también).
- **`pgErrorCode`** (`src/lib/pg-error.ts`, de 05) para distinguir `23505`.
- **Patrón de action** de `booking/actions.ts` (`requireRole` fuera del `try`, `safeParse`, `console.error` + mensaje genérico) y de zod compartido cliente/servidor de `checkout.schema.ts` (su `buyerSchema` y `getCheckoutErrors` se llevan, sin la parte de tarjeta, a `buyer.schema.ts`; el original se borra en T4).
- **Tablas** `orders`, `orderItem`, `payment`, `platformSetting`, `organizer`, `reservation`, `reservationItem`, `eventZone`.
- **UI**: `CheckoutForm` (formulario, `FormField`, `Input`, `Select`, `PayButton`, `EmptyState`, `usePersistHydration`, `ReservationTimer`, `CheckoutSummary`), `Button`, `formatEventPrice`. No hace falta `npx shadcn add`.
- **Descartado reutilizar**: `createOrderId` (mock del store, `booking.store.ts:25`), que solo se conserva como parámetro por defecto de `confirmOrder`; `order-service.ts` (mock `getMyOrders`; importar `@/db` ahí rompería su test): la escritura real va en archivos nuevos.

## Archivos

| Archivo | Cambio | Tarea |
| --- | --- | --- |
| `package.json`, `package-lock.json` | + `@stripe/stripe-js` `10.0.0`, `@stripe/react-stripe-js` `7.0.0` (exactas) | T0 |
| `src/db/schema/order.ts` | `orders_reservation_id_idx` pasa a índice único (`orders_reservation_id_unique`) | T0 |
| `drizzle/0003_*.sql`, `drizzle/meta/0003_snapshot.json`, `drizzle/meta/_journal.json` | generados con `npm run db:generate`; se agrega a mano el `INSERT … ON CONFLICT DO NOTHING` de `platform_fee_percent` (valor `10`) | T0 |
| `src/modules/booking/buyer.schema.ts` | nuevo: comprador y términos (sin tarjeta); `DOCUMENT_TYPES` de DB + `DOCUMENT_TYPE_LABELS`; `getBuyerErrors`; `startCheckoutSchema` | T1 |
| `src/modules/booking/buyer.schema.test.ts` | nuevo (reemplaza al de `checkout.schema`) | T1 |
| `src/modules/booking/checkout.schema.ts`, `src/modules/booking/checkout.schema.test.ts` | eliminados (los reemplaza `buyer.schema.*`) | T4 |
| `src/modules/booking/checkout.types.ts` | nuevo: `StartCheckoutResult`, `BuyerDefaults`, tipos de fila | T1 |
| `src/modules/booking/checkout.utils.ts` | nuevo: mensajes y funciones puras | T1 |
| `src/modules/booking/checkout.utils.test.ts` | nuevo | T1 |
| `src/modules/payment/payment.types.ts` | + `PaymentGateway`, `PaymentIntentState`, `PreparedPayment`, `PaymentIntentParams` | T1 |
| `src/modules/payment/payment.utils.ts` | + funciones puras de pago | T1 |
| `src/modules/payment/payment.utils.test.ts` | ampliado | T1 |
| `src/modules/payment/payment.schema.ts` | nuevo: `platformFeePercentSchema` | T1 |
| `src/modules/payment/payment.schema.test.ts` | nuevo | T1 |
| `src/modules/payment/services/stripe-payment-gateway.ts` | nuevo (único junto a `stripe-client.ts` y `stripe-connect-gateway.ts` que importa `stripe`) | T2 |
| `src/modules/payment/services/payment-record-service.ts` | nuevo (DB) | T2 |
| `src/modules/payment/services/payment-service.ts` | nuevo: `preparePayment` | T2 |
| `src/modules/payment/services/payment-service.test.ts` | nuevo | T2 |
| `src/modules/payment/services/platform-fee-service.ts` | nuevo: `getPlatformFeePercent` | T2 |
| `src/modules/payment/components/CardPaymentProvider.tsx` | nuevo (cliente) | T2 |
| `src/modules/payment/hooks/use-checkout-payment.ts` | nuevo (cliente) | T2 |
| `src/modules/booking/services/reservation-service.ts` | + `getLiveReservationForOrder` (no cambia lo existente) | T3 |
| `src/modules/booking/services/checkout-data-service.ts` | nuevo (DB) | T3 |
| `src/modules/booking/services/checkout-service.ts` | nuevo: `startCheckout` | T3 |
| `src/modules/booking/services/checkout-service.test.ts` | nuevo | T3 |
| `src/modules/booking/actions.ts` | + `startCheckoutAction` | T3 |
| `src/modules/booking/components/CheckoutForm.tsx` | Payment Element, `buyerDefaults`, sin tarjeta manual ni Yape/PagoEfectivo | T4 |
| `src/modules/booking/components/PaymentMethodPicker.tsx` | eliminado | T4 |
| `src/app/(platform)/events/[slug]/checkout/page.tsx` | pasa `buyerDefaults` | T4 |
| `src/modules/booking/booking.types.ts` | `PaymentMethod = "card"` | T4 |
| `src/modules/booking/services/order-service.ts` | solo el mock: `method: "yape"` → `"card"` | T4 |
| `src/modules/booking/booking.store.test.ts` | solo los dos `"yape"` → `"card"` | T4 |

### Contratos fijados (para que las tareas no dependan de decisiones ajenas)

```ts
// payment.types.ts
export type PaymentIntentState = "requires_payment" | "processing" | "succeeded" | "closed";
export type PreparedPayment =
  | { state: "requires_payment"; clientSecret: string }
  | { state: "processing" | "succeeded" };
export interface PaymentIntentParams {
  amount: number; // minor units
  currency: string; // lowercase
  payment_method_types: ["card"];
  application_fee_amount?: number; // only when > 0
  transfer_data: { destination: string };
  metadata: Record<string, string>;
}
export interface PaymentGateway {
  createPaymentIntent(params: PaymentIntentParams, idempotencyKey: string): Promise<{ id: string; clientSecret: string; status: string }>;
  retrievePaymentIntent(id: string): Promise<{ id: string; clientSecret: string; status: string }>;
}

// payment-service.ts
export interface PreparePaymentInput {
  orderId: string; orderCode: string; reservationId: string; eventId: string; userId: string;
  totalCents: number; platformFeeCents: number; currency: string; destinationAccountId: string;
}
export async function preparePayment(input: PreparePaymentInput, gateway?: PaymentGateway): Promise<PreparedPayment>;
// `closed` (PaymentIntent cancelado) se lanza como error; el llamador responde `generic`.

// checkout-data-service.ts (DB; no depende de `Event` público, que no trae el organizador)
export async function findPayoutAccount(eventId: string): Promise<{ accountId: string | null; onboardingStatus: StripeOnboardingStatus } | null>; // join event → organizer; null si el evento no existe

// checkout.types.ts (cable, sin Date)
export type StartCheckoutResult =
  | { ok: true; data: { orderCode: string; payment: PreparedPayment } }
  | { ok: false; error: string };

// use-checkout-payment.ts
// pay({ startCheckout, returnUrl, billing }) => Promise<{ ok: true } | { ok: false; error: string }>
//   startCheckout: () => Promise<{ ok: true; payment: PreparedPayment } | { ok: false; error: string }>
// ok = el PaymentIntent quedó `succeeded` o `processing`.
```

## Criterios de aceptación

Los manuales usan el modo test de Stripe, un organizador con Connect `complete` (AC17 de `organizer-stripe-connect.md`) y un evento publicado suyo con la DB sembrada.

- AC1 (de la tarjeta): con una reserva viva, el checkout muestra el Payment Element **dentro de la página** (sin redirigir a Stripe Checkout). Pagar con `4242 4242 4242 4242` deja: una fila `orders` `pending` (con `reservation_id`, `user_id`, `event_id`, snapshot del comprador y `terms_accepted_at` no nulo), un `order_item` por entrada (los GA se expanden a `quantity` filas con `event_seat_id` NULL) y una fila `payment` `pending`. La reserva sigue `active`.
- AC2 (PaymentIntent): en Stripe, el PaymentIntent tiene `amount` = `orders.total_cents`, `currency` = la del evento en minúscula, `application_fee_amount` = `orders.platform_fee_cents`, `transfer_data.destination` = `organizer.stripe_account_id`, `payment_method_types = ["card"]` y la metadata `{ order_id, order_code, reservation_id, event_id, user_id }`. La fila `payment` guarda ese `stripe_payment_intent_id`, `amount_cents`, `application_fee_cents` y `destination_account_id`.
- AC3 (importes en servidor): la action solo recibe `slug` y los datos del comprador. `subtotal_cents` = Σ `event_zone.price_cents` de la reserva (por entrada), `platform_fee_cents` = `round(subtotal × platform_fee_percent / 100)` y `total_cents` = `subtotal_cents`. Alterar la petición (otro `amount`, otra reserva) no cambia lo cobrado.
- AC4 (comisión): la migración deja `platform_setting.platform_fee_percent = 10` sin duplicar si ya existe. Cambiar el valor en la DB cambia la comisión de las **nuevas** órdenes. Con la fila ausente o inválida (no número, < 0 o > 100) la action responde el mensaje genérico, registra el error y **no escribe** ninguna orden.
- AC5 (solo tarjeta): el formulario ya no muestra Yape ni PagoEfectivo, ni campos manuales de tarjeta (número, vencimiento, CVV, nombre en tarjeta); `PaymentMethodPicker.tsx` no existe; el Payment Element solo ofrece tarjeta.
- AC6 (precarga): con un `user` que ya tiene teléfono y documento (`document_type`, `document_number`), el formulario abre con nombre, correo, tipo y número de documento y celular rellenos; con un `user` sin ellos, vacío (tipo de documento `dni` por defecto). La precarga no escribe en la DB.
- AC7 (idempotencia):
  - doble clic en "Pagar", dos pestañas o un reintento tras una tarjeta rechazada (`4000 0000 0000 0002`) dejan **una** orden, **un** `payment` y **un** PaymentIntent por reserva;
  - el reintento reutiliza el mismo `client_secret` y permite pagar con otra tarjeta;
  - si el comprador corrige datos entre intentos, el snapshot `buyer_*` de la orden se actualiza y los importes no cambian;
  - con la orden `paid`, `failed` o `cancelled` la action responde `orderClosed` y no crea nada.
- AC8 (reserva): sin reserva viva (nunca hubo, venció o fue reemplazada) la action responde `reservationExpired` sin escribir; con reserva viva pero ya vencida en el reloj de la DB al enviar, igual. Un cliente que manipula la petición no puede pagar la reserva de otro usuario (se resuelve con la sesión).
- AC9 (Connect): si el organizador del evento no tiene `stripe_account_id` o su `stripe_onboarding_status` ≠ `complete`, la action responde `payoutsUnavailable` y **no** crea orden ni PaymentIntent. Un error de Stripe al crear el PaymentIntent se registra en el servidor sin datos personales y el cliente ve el mensaje genérico.
- AC10 (validación): la action rechaza con "Datos inválidos." (sin escribir) un `slug` vacío, correo inválido, nombre de menos de 3 caracteres, documento inválido para su tipo (DNI: 8 dígitos; CE/pasaporte: 6 a 12 alfanuméricos), celular fuera de 9 a 15 dígitos y `acceptTerms` distinto de `true`; con "Este evento ya no está disponible." si el evento no es visible o no existe. Sin sesión redirige a `/sign-in` (igual que 05).
- AC11 (total 0): una reserva cuyo subtotal es 0 responde `nothingToPay` sin escribir.
- AC12 (flujo en el cliente): el submit valida los campos del comprador y los errores del Payment Element antes de llamar al servidor, el botón queda deshabilitado y dice "Procesando…" mientras corre, y los errores (de la action o de Stripe) se muestran con `role="alert"` en la tarjeta y en la barra fija de móvil. Un pago con tarjeta 3DS de prueba (`4000 0027 6000 3184`) se completa en la página (modal) sin redirigir.
- AC13 (post-pago, transitorio): con `succeeded` o `processing` el cliente llama `confirmOrder` con el `code` real de la orden como `id` y navega a `/events/<slug>/confirmation`. El temporizador y el estado "Tu reserva expiró" siguen igual que en 05.
- AC14 (frontera Stripe): `grep -rn "from \"stripe\"" src` solo devuelve `stripe-client.ts`, `stripe-connect-gateway.ts` y `stripe-payment-gateway.ts`; `@stripe/stripe-js` y `@stripe/react-stripe-js` solo aparecen bajo `src/modules/payment/components` y `src/modules/payment/hooks`; `STRIPE_SECRET_KEY` solo en `stripe-client.ts`; `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` solo en `CardPaymentProvider.tsx`; nada en `booking` importa Stripe.
- AC15 (migración): `npm run db:generate` produce únicamente el índice único de `orders.reservation_id` (más el `INSERT` agregado a mano); `npm run db:migrate` aplica en una base con 0000 a 0002.
- AC16 (calidad):
  - los services no importan `next/*`; la action sigue el patrón de `booking/actions.ts`;
  - `grep -rniE "yape|pagoefectivo|\"cash\"" src` no devuelve nada;
  - no cambian `reservation.*`, `booking.store.ts`, `ReservationTimer.tsx`, `CheckoutSummary.tsx`, `OrderConfirmation.tsx`, `payment/actions.ts` ni los archivos de Connect;
  - `npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan en verde al cerrar cada ola, no solo al final.

## Tests requeridos

(Vitest, junto al archivo. El SQL de los services de datos y el Payment Element no se prueban con unit tests: se verifican con AC1 a AC15, precedente de `reservation-hold.md`.)

- `src/modules/booking/buyer.schema.test.ts` (nuevo; sustituye a `checkout.schema.test.ts`, que se borra en T4): comprador válido y normalización del celular; cada tipo de documento (`dni`, `ce`, `passport`) con su regla; un mensaje por campo inválido; términos no aceptados; `startCheckoutSchema` rechaza `slug` vacío y descarta claves desconocidas (p. ej. un `amount` o `reservationId` enviado por el cliente); `getBuyerErrors` no menciona campos de tarjeta; no hay casos de Yape, PagoEfectivo ni tarjeta.
- `src/modules/booking/checkout.utils.test.ts`:
  - `generateOrderCode`: formato `TK-` + 8 caracteres del alfabeto, determinista con un `randomInt` inyectado, sin caracteres ambiguos;
  - `toOrderItems(orderId, items)`: una fila por asiento; un ítem GA con `quantity` 3 → 3 filas con `eventSeatId` null; todos con `orderId` y `unitPriceCents` de su zona;
  - `calculateOrderAmounts(items, percent)`: `subtotalCents`, `platformFeeCents`, `totalCents = subtotalCents`; GA y asientos mezclados; porcentaje 0 y 100; fracción (7,5 %) con redondeo; subtotal 0;
  - `toBuyerDefaults(user)`: con todo; sin teléfono/documento (cadenas vacías y `dni`); sin nombre.
- `src/modules/payment/payment.utils.test.ts` (ampliado, sin romper los casos de 06):
  - `calculatePlatformFeeCents`: redondeo `Math.round`, nunca negativa ni mayor al subtotal, 0 % y 100 %;
  - `mapPaymentIntentStatus`: `succeeded` → `succeeded`; `processing` → `processing`; `canceled` → `closed`; `requires_payment_method`, `requires_confirmation`, `requires_action` → `requires_payment`;
  - `toPaymentIntentParams`: `currency` en minúscula, `payment_method_types ["card"]`, `transfer_data.destination`, metadata completa solo con strings, `application_fee_amount` presente solo si > 0;
  - `amountToCents`: 59,97 → 5997 (sin error de coma flotante), 0, entero;
  - `resolveConfirmation`: `paymentIntent.status` `succeeded`/`processing` → ok; error de tarjeta (`card_error`) → su mensaje; error de otro tipo o estado inesperado → mensaje genérico.
- `src/modules/payment/payment.schema.test.ts`: `platformFeePercentSchema` acepta 0, 10, 7,5 y 100; rechaza -1, 100,5, `"10"`, `NaN`, `null` y objetos.
- `src/modules/payment/services/payment-service.test.ts` (gateway falso; `payment-record-service` con `vi.mock`, como en `connect-service.test.ts`):
  - sin `payment` previo: crea el PaymentIntent con los parámetros esperados y la clave `payment-intent:<orderId>`, inserta la fila `pending` y devuelve `requires_payment` con el `clientSecret`;
  - con `payment` previo: **no** crea; hace `retrieve` y devuelve el estado mapeado (`requires_payment`, `processing`, `succeeded`);
  - PaymentIntent `closed` → lanza;
  - el `insert` devuelve vacío por carrera (`ON CONFLICT DO NOTHING`): relee y usa el existente;
  - un error del gateway se propaga y no inserta.
- `src/modules/booking/services/checkout-service.test.ts` (`vi.mock` de `checkout-data-service`, `reservation-service`, `platform-fee-service` y `payment-service`):
  - camino feliz: crea la orden con importes calculados desde los ítems de DB y llama a `preparePayment` con los importes y la cuenta de destino;
  - reintento: con orden `pending` existente actualiza el snapshot, **no** crea otra orden y reutiliza los importes guardados;
  - orden no `pending` → `orderClosed`;
  - sin reserva viva → `reservationExpired` y nada escrito;
  - organizador sin cuenta o con onboarding ≠ `complete` → `payoutsUnavailable`, sin orden;
  - subtotal 0 → `nothingToPay`;
  - fila de comisión inválida (el service lanza) → se propaga, sin orden;
  - el insert de la orden pierde por UNIQUE de la reserva: relee la orden existente y sigue.
- Sin unit tests para `stripe-payment-gateway.ts`, `payment-record-service.ts`, `platform-fee-service.ts` (el parseo vive en el schema), `checkout-data-service.ts`, `actions.ts`, `CardPaymentProvider.tsx`, `use-checkout-payment.ts` (la lógica de decisión vive en `resolveConfirmation`), `CheckoutForm.tsx` ni la página.
- `booking.store.test.ts` se ajusta solo por `"yape"` → `"card"`; debe seguir en verde.

## Tareas

Salvedad previa (como en `organizer-stripe-connect.md`, Pregunta 13): hoy `src/modules/booking/{actions.ts,reservation.*,services/reservation-service.ts}`, `src/modules/payment/*`, `drizzle/0002_*` y `drizzle/meta/_journal.json` tienen cambios sin commitear de 05 y 06. **Implementar después de que 05 y 06 estén en main**: T0 por la numeración `0003_` y el `_journal.json`, y T3 y T4 por los archivos de 05 que modifican.

### T0: Base (dependencias, índice único y semilla de comisión)

- Archivos: `package.json`, `package-lock.json`, `src/db/schema/order.ts`, `drizzle/0003_*.sql`, `drizzle/meta/0003_snapshot.json`, `drizzle/meta/_journal.json`
- Depende de: — (y de 05/06 en main, ver salvedad)
- Paralelizable: sí (con T1)
- Cubre: AC4 (semilla), AC15, base de AC7

### T1: Núcleo puro del checkout y del pago

- Archivos: `src/modules/booking/buyer.schema.ts`, `src/modules/booking/buyer.schema.test.ts`, `src/modules/booking/checkout.types.ts`, `src/modules/booking/checkout.utils.ts`, `src/modules/booking/checkout.utils.test.ts`, `src/modules/payment/payment.types.ts`, `src/modules/payment/payment.utils.ts`, `src/modules/payment/payment.utils.test.ts`, `src/modules/payment/payment.schema.ts`, `src/modules/payment/payment.schema.test.ts`
- Depende de: —
- Paralelizable: sí (con T0; no importa nada de T0)
- Cubre: AC3 (cálculo), AC4 (schema), AC6 (precarga pura), AC10 (schema), AC11, AC16 (tests)
- Nota: T1 solo agrega archivos nuevos o amplía `payment.*`; no cambia ninguna firma existente, así que `tsc` sigue en verde al cerrar cada ola (`checkout.schema.ts` y `CheckoutForm.tsx` quedan intactos hasta T4).

### T2: Módulo `payment`: gateway, servicio, comisión y Payment Element

- Archivos: `src/modules/payment/services/stripe-payment-gateway.ts`, `src/modules/payment/services/payment-record-service.ts`, `src/modules/payment/services/payment-service.ts`, `src/modules/payment/services/payment-service.test.ts`, `src/modules/payment/services/platform-fee-service.ts`, `src/modules/payment/components/CardPaymentProvider.tsx`, `src/modules/payment/hooks/use-checkout-payment.ts`
- Depende de: T0 (paquetes `@stripe/*`), T1 (tipos, utils, schema)
- Paralelizable: no (ola 2, sola: T3 importa `preparePayment` y `getPlatformFeePercent`)
- Cubre: AC2, AC4 (lectura), AC7, AC9 (error de Stripe), AC12 (hook), AC14

### T3: Servidor de `booking`: orden pendiente, orquestación y action

- Archivos: `src/modules/booking/services/reservation-service.ts`, `src/modules/booking/services/checkout-data-service.ts`, `src/modules/booking/services/checkout-service.ts`, `src/modules/booking/services/checkout-service.test.ts`, `src/modules/booking/actions.ts`
- Depende de: T0 (índice único), T1, T2
- Paralelizable: no (ola 3, sola)
- Cubre: AC1, AC2, AC3, AC4 (sin escritura), AC7, AC8, AC9, AC10, AC11, AC16

### T4: Checkout con Payment Element, precarga y limpieza de Yape/PagoEfectivo

- Archivos: `src/modules/booking/components/CheckoutForm.tsx`, `src/modules/booking/components/PaymentMethodPicker.tsx` (eliminar), `src/modules/booking/checkout.schema.ts` (eliminar), `src/modules/booking/checkout.schema.test.ts` (eliminar), `src/app/(platform)/events/[slug]/checkout/page.tsx`, `src/modules/booking/booking.types.ts`, `src/modules/booking/services/order-service.ts` (solo el mock), `src/modules/booking/booking.store.test.ts` (solo los dos `"yape"`)
- Depende de: T1, T2 (provider y hook), T3 (`startCheckoutAction`)
- Paralelizable: no (ola 4, sola). Va junta porque `CheckoutForm`, el borrado de `checkout.schema.ts`, la página y el tipo `PaymentMethod` no compilan por separado.
- Cubre: AC1 (UI), AC5, AC6, AC12, AC13, AC14, AC16

Olas:

- **Ola 1** = T0 ∥ T1 (archivos disjuntos, sin imports entre sí).
- **Ola 2** = T2. **Ola 3** = T3. **Ola 4** = T4.

**Paralelizables: T0 y T1.** T2 → T3 → T4 son una cadena por imports (`preparePayment`, `startCheckoutAction`).

## Preguntas abiertas

Cada pregunta trae un valor por defecto: si no hay respuesta, se aplica ese valor.

1. **Moneda: precios en PEN, cuenta conectada de prueba en `usd` (país `us`).** *(Obligatoria; las tareas asumen la recomendación hasta que el humano responda.)*

   | Opción | Cómo funciona | Problema |
   | --- | --- | --- |
   | **(a) Cobrar en la moneda del evento (`pen`) y dejar que Stripe convierta** | PaymentIntent en `pen` con los céntimos de la DB. Destination charge **sin** `on_behalf_of`: Stripe convierte `pen` a la moneda de liquidación de la plataforma y luego el monto transferido a la de la cuenta conectada (`usd`). | FX con comisión de Stripe; el comprador ve S/ y el organizador recibe USD. |
   | (b) Forzar `usd` en demo | El PaymentIntent y el Element en `usd` con un importe convertido. | La UI muestra S/ y cobraría US$: o se rehace la UI o el comprador ve dos importes distintos; hay que decidir un importe en USD igualmente (tasa). |
   | (c) Convertir con tasa fija en código | Se cobra en `usd` con `priceCents × tasa`. | Inventa una tasa que Stripe no usa; `orders`/`payment` no tienen dónde registrar la conversión y el recibo no cuadra con la orden. |

   **Recomendación (y asumida): (a).** Es lo más simple (sin FX en código ni columnas nuevas), mantiene la UI en S/ y coincide con `system-design §2` (moneda `PEN`). Hechos de Stripe y limitaciones reales:
   - **PEN sí está en la lista de monedas de presentación** de Stripe (`docs.stripe.com/currencies`, con asterisco: American Express no la soporta); la propia doc avisa que una moneda "puede no estar disponible en tu país". Si Stripe rechaza `pen` para la plataforma, el developer lo reporta en "Bloqueos" y la decisión se vuelve a abrir (no se construye un plan B anticipado).
   - **La conversión es de Stripe**, con su comisión de FX y al tipo de cambio de mercado; el monto cobrado al comprador es exactamente `total_cents` en PEN. La moneda de transferencia y de la comisión de plataforma es la de liquidación de la cuenta conectada (`application_fee_amount` se calcula en la moneda de la transacción y liquida en la de la conectada).
   - **Mínimo de cobro**: Stripe exige un mínimo en el equivalente de la moneda de liquidación (la doc lo da por moneda; el developer verifica el valor para `usd`); una entrada muy barata podría fallar al crear el PaymentIntent (error genérico).
   - **No se puede usar `on_behalf_of`** para que liquide la cuenta conectada: las cuentas de 06 son v2 `recipient` solo con `stripe_transfers`, sin `card_payments`. Por eso el flujo debe ser un destination charge "puro", que exige que **plataforma y cuenta conectada estén en la misma región** (`connect/destination-charges`, "settlement merchant"). Con la cuenta conectada en `us`, hay que confirmar que la cuenta de plataforma de prueba también es US (ver Pregunta 5).
   - `orders`/`payment` no guardan `currency`: todo va en la moneda de `event.currency`; si luego hay eventos en otras monedas, el reporte debe unir con `event`.
2. **¿Quién paga la comisión?** Por defecto: **el organizador** (D3): el comprador paga el subtotal y la comisión sale de lo que recibe el organizador (`total_cents = subtotal_cents`). Alternativa: comisión "encima" (`total = subtotal + fee`), que obliga a mostrar una línea de comisión y a que el servidor entregue el total al cliente antes de montar el Element.
3. **Valor de la comisión sembrada.** Por defecto: **10 %** (`platform_fee_percent = 10`), con decimales permitidos. La edición queda para la tarjeta 15; hasta entonces se cambia en la DB.
4. **Gate de Connect: `charges_enabled` (tarjeta) vs `stripe_onboarding_status = 'complete'` (spec 06).** Por defecto: **solo la DB** (D9): `stripe_account_id` + `complete`, sin releer Stripe. Releer `getTransfersStatus` al crear cada PaymentIntent agrega una llamada por pago y solo cubre la ventana entre un webhook perdido y el checkout; si Stripe rechaza el destino, el error se loguea y el usuario ve el mensaje genérico. Si se prefiere un mensaje claro, se puede mapear ese error de Stripe a `payoutsUnavailable`.
5. **País de la cuenta de plataforma.** El repo solo declara el país de la cuenta **conectada** (`STRIPE_CONNECT_ACCOUNT_COUNTRY`). Por defecto: **se asume que la plataforma de prueba también es US**. Si no lo fuera, el destination charge entre regiones puede fallar (y no existe `on_behalf_of`, Pregunta 1). El developer lo comprueba con el primer pago de prueba.
6. **Confirmación y "Mis entradas" siguen locales hasta la 08.** Por defecto: **sí, transitorio** (D15). Tras pagar, el comprador ve una confirmación con entradas generadas en el navegador aunque la orden siga `pending` en la DB; el correo y las entradas reales llegan con la 08. Alternativa: mostrar "Pago en proceso" hasta que la 08 marque `paid`, que exige tocar la página de confirmación (fuera de alcance).
7. **Hold que vence mientras se paga.** Por defecto: **sin margen** (D8): se exige reserva viva al crear/reanudar el pago, pero un PaymentIntent confirmado (p. ej. tras un 3DS lento) después del vencimiento lo resuelve la 08 (reembolso). Alternativas: exigir un margen mínimo (p. ej. 60 s) al iniciar el pago, o extender `expires_at` al crear la orden.
8. **Órdenes `pending` huérfanas.** Una reserva reemplazada (D3 de 05) o vencida deja su orden `pending` y su PaymentIntent abierto. Por defecto: **no se limpian aquí** (08/10: cancelar PaymentIntent y pasar la orden a `cancelled`). El PaymentIntent huérfano no es confirmable sin su `client_secret`, que solo vive en la pestaña que lo pidió.
9. **Entradas gratuitas.** Por defecto: **no soportadas** (`nothingToPay`, AC11). Una zona de precio 0 sola no se puede cobrar con Stripe; cuando exista el requisito, se salta Stripe y se emite la entrada directamente.
10. **Precarga y escritura hacia `user`.** Por defecto: se precargan nombre, correo, documento y celular desde `user`, y **no se escribe nada de vuelta** (si el comprador completa su celular, no se guarda en su perfil). Alternativa: guardarlo al crear la orden si el campo estaba vacío.
11. **Formato del `code` del pedido.** Por defecto: `TK-` + 8 caracteres base32 (D11), en lugar de `TK-` + 5 dígitos del ejemplo del ERD (`TK-24817`) y del mock; `order.id` en la UI local pasa a ser ese `code`. Si se prefiere mantener 5 dígitos, hace falta un bucle de reintento ante colisión.
12. **Índice único `orders.reservation_id` y semilla de `platform_setting`.** El índice único no figura en `erd.md §5` (los docs de arquitectura no se modifican): divergencia menor reportada aquí, como la de `stripe_account_id` en 06. Por defecto: se agrega; sin él, la idempotencia dependería solo de comprobaciones en la aplicación.
13. **Solo tarjeta: restricción explícita vs Dashboard.** Por defecto: `payment_method_types: ["card"]` en el PaymentIntent y la opción equivalente en `Elements` (D13), no los métodos administrados en el Dashboard de Stripe. Los monederos que Stripe expone como "card" (p. ej. Link, Apple/Google Pay) pueden aparecer; si no se quieren, se desactivan en el Dashboard.
14. **A confirmar por el developer al instalar** `@stripe/stripe-js@10.0.0` y `@stripe/react-stripe-js@7.0.0` (mismo criterio que `stripe@23.0.0` en 06): nombres exactos de las opciones de `Elements` (tipos de pago permitidos), de `fields.billingDetails` y de `confirmParams.payment_method_data.billing_details`, la firma de `idempotencyKey` en `paymentIntents.create` del SDK y la forma del `client_secret` en el objeto devuelto por `retrieve`. Si algo difiere de esta spec: "Bloqueos".

## Próximas fases

- Tarjeta 08: webhook `/api/webhooks/stripe` (`payment_intent.succeeded` / `payment_failed`, `charge.refunded`), orden `paid`, conversión de la reserva y del inventario, `ticket` por `order_item`, reembolso si la reserva ya no está viva, y confirmación/"Mis entradas" con datos reales.
- Tarjeta 10: job `/api/jobs/release-holds` y cancelación de órdenes/PaymentIntents `pending` con reserva vencida o reemplazada.
- Tarjeta 15: UI de ajustes de comisión (`platform_setting`, solo `super_admin`).
- Comisión visible como línea del resumen y "comisión encima del precio" si la Pregunta 2 se responde así.
- Guardar teléfono y documento en el perfil del usuario (Pregunta 10).
- Margen o extensión del hold al iniciar el pago (Pregunta 7) y `totalCents` en `ActiveReservation` para eliminar la conversión flotante del `amount` de `Elements`.
- Entradas gratuitas sin Stripe (Pregunta 9).
- Columna `currency` en `orders`/`payment` si aparecen eventos en otras monedas.
