# Confirmación y "Mis entradas" con datos reales (QR real)

Estado: aprobada

## Objetivo

Tarjeta Trello "09 · Confirmación y Mis entradas con datos reales (QR real)". Hoy `/events/[slug]/confirmation` y `/my-tickets` muestran `MOCK_ORDERS` y las compras guardadas en `localStorage` (`booking.store`: `lastOrder`, `orders`, `confirmOrder`), y el QR es decorativo (`qr-pattern.tsx` genera módulos pseudoaleatorios que no se pueden escanear). La tarjeta 08 (webhook de Stripe, ya en main) emite un `ticket` con `code` único por `order_item`; esta spec lo muestra.

1. La confirmación lee la orden real del usuario (`orders` + `order_item` + `ticket`) y muestra "procesando" mientras el webhook no la pasa a `paid`.
2. "Mis entradas" lista las órdenes con entradas del usuario desde la DB, próximas y pasadas.
3. El QR codifica `ticket.code` y es escaneable; el PDF (`ticket-export.ts`) usa la misma matriz.
4. Se borran `MOCK_ORDERS` y la persistencia de compras en `booking.store`.

**Listo cuando**: después de pagar, la entrada aparece en "Mis entradas" desde otro navegador (misma cuenta) y su QR se puede leer (AC15, verificación manual).

Referencias consultadas (solo estas secciones): `system-design.md §3` (roles: `customer` "ve sus entradas"; el chequeo de propiedad va en el service contra la DB), `§5.1` pasos 3–4 (webhook emite `ticket` con `code` para el QR; la reserva perdida deja la orden `cancelled`), `§5.3` (el check-in compara `code` exacto, por eso el QR lleva el `code` crudo), `erd.md §3` "Compra y pago" y "Entrada y check-in", `erd.md §4` ("un ticket por ítem": `ticket.order_item_id` UQ) y `§5` (`orders(user_id, created_at)`). Specs revisadas para reutilizar convenciones: `stripe-payment-webhook` (formato de `ticket.code`, estados de orden, Pregunta 4: "la confirmación local transitoria queda hasta la 09"), `checkout-stripe-payment-intent` (código de orden `TK-` + 8, `startCheckoutAction`) y `account-and-organizer` (UI mock original de Mis entradas, aprobada; aquí solo se reemplaza el origen de datos).

## Hechos verificados (repo, 2026-10-12)

- Las rutas son `/events/[slug]/confirmation` (la tarjeta dice `[id]`; el repo usa `[slug]`) y `/my-tickets`. `src/proxy.ts` solo protege `/my-tickets`: la confirmación se protege con `requireRole("customer")` en la página y en la action.
- Patrón de acceso a datos del repo: Server Component o Server Action con `requireRole(...)` → service que recibe `user.id` (nunca del input) → Drizzle con joins explícitos (`db.select().from().innerJoin()`; no se usa `db.query`). Separación `*-data-service.ts` (queries, sin test) y `*-service.ts` (lógica, test con `vi.mock` del data service), como `checkout-data-service`/`checkout-service`. No hay route handlers salvo webhooks.
- Patrón de TanStack Query: `use-events.ts` exporta `fetchX` (llama a la Server Action y lanza si `!ok`) y `xQueryKey`; el test mockea la action. `QueryClientProvider` ya está montado (`src/components/Providers.tsx` en `src/app/layout.tsx`): no hace falta tocar el layout.
- `startCheckoutAction` ya devuelve `orderCode` (`TK-` + 8; ver `generateOrderCode` en `checkout.utils.ts`) y `CheckoutForm` lo tiene en `started.orderCode`; hoy navega a `/events/${slug}/confirmation` sin él.
- La orden nace `pending` en `startCheckout` (antes de pagar) y el webhook la pasa a `paid` y crea los `ticket` en un solo `db.batch`; si la reserva se perdió queda `cancelled` y se reembolsa. Por eso "sin tickets aún" equivale a `status = "pending"`.
- La confirmación actual usa `getPublicEventDetail(slug)`, que filtra `published` y `starts_at > now`: devolvería 404 una vez empezado el evento. La orden debe traer su propio resumen de evento.
- `src/modules/event/services/event-service.ts` (mock) NO se borra: lo usan `seed-data.ts` y `venue-service.ts`. Solo `my-tickets/page.tsx` y `order-service.test.ts` dejan de importarlo.
- `qrcode.react@4.2.0` solo está en `node_modules` como dependencia transitiva de `@clerk/ui` (no está en `package.json`) y no expone la matriz de módulos que necesita el PDF (`jsPDF` dibuja rectángulos). No hay otra librería de QR.
- `MyTickets` y `TicketDetailCard` usan `next/image` crudo; `next.config.ts` solo permite `images.unsplash.com` y `cover_image_url` puede estar vacío o ser de cualquier host: usar `EventCover` (ya `unoptimized` y con placeholder para `""`).
- `MyTickets` calcula "hoy" con la hora del navegador (`todayIso()`); `event-list.utils.ts` ya tiene `toLimaDate`/`toLimaTime` (todos los recintos están en Lima).
- `CheckoutForm` usa `usePersistHydration(useBookingStore)` para el temporizador y la selección persistida (su comentario cita `confirmOrder`): el hook se queda, solo se actualiza el comentario.
- `use-persist-hydration.ts` se queda (lo usan `TicketSelection`, `CheckoutForm` y `PanelShell`).

## Alcance

- Incluye:
  - Contrato de tipos de orden (`MyOrder`, `MyTicket`, `MyOrderEvent`) y lectura de órdenes del usuario desde la DB, siempre filtrada por `orders.user_id`.
  - `/events/[slug]/confirmation?order=<code>`: lee la orden con `findMyOrder(user.id, code)` en el servidor (dato inicial) y la sigue consultando con TanStack Query + Server Action mientras esté `pending`, con tope de 60 s. Estados: procesando, lista, tardando, fallida (`cancelled`/`failed`), no encontrada y error de consulta con reintento.
  - `CheckoutForm` navega con `?order=<code>` y limpia la selección al pagar.
  - `/my-tickets`: lista las órdenes con entradas del usuario (`paid`, `partially_refunded`, `refunded`), próximas y pasadas según la fecha del evento en Lima, calculada en el servidor.
  - QR real con `ticket.code` (SVG en pantalla y rectángulos en el PDF, misma matriz) con librería nueva en T0; las entradas no `valid` muestran su estado en vez del QR.
  - `ticket-export.ts` (PDF e `.ics`) consume `MyOrder`/`MyTicket` reales.
  - Borrar `MOCK_ORDERS`, `getMyOrders`, `qr-pattern.tsx`, `Order`/`PaymentMethod` de `booking.types.ts` y `lastOrder`/`orders`/`confirmOrder`/`createOrderId` de `booking.store`; limpiar lo que quedó en `localStorage`.
- No incluye:
  - Correo de confirmación con las entradas (el texto "Enviamos tus entradas a …" se mantiene; ver Preguntas abiertas 6).
  - Reembolsos, `charge.refunded`, `refund`/`refund_ticket` (tarjeta 12) ni el check-in/escáner (consumirá `ticket.code`; fuera de esta spec).
  - Mostrar órdenes `pending`/`cancelled`/`failed` en "Mis entradas".
  - Cambiar la persistencia de la selección de asientos (`eventId`, `seats`, `quantities`, `activeZoneId`) en `booking.store`.
  - Tocar `proxy.ts`, el layout, `globals.css`, el esquema de la DB o el webhook.
  - Borrar `event-service.ts` (mock), que sigue alimentando el seed.
  - Pruebas de componentes (no hay `@testing-library`; los componentes sin lógica no requieren test).

## Reutilizar

- `requireRole("customer")` (`src/modules/user/current-user.ts`) en páginas y actions; `user.id` de la sesión es lo único que llega al service.
- Patrón `fetchX` + `xQueryKey` de `src/modules/event/hooks/use-events.ts`; `Providers.tsx` ya monta el `QueryClient`.
- `toLimaDate`/`toLimaTime` (`event-list.utils.ts`) para `date`/`startsAt`; `formatEventDateParts` y `formatEventPrice` (`event.utils.ts`).
- Patrón `*-data-service.ts` + `*-service.ts` (`checkout-data-service.ts`, `checkout-service.ts` y su test con `vi.mock`).
- `generateOrderCode`/`ORDER_CODE_ALPHABET` (`checkout.utils.ts`) como fuente del formato del código para validar `?order=`; `OrderStatus` de `payment.types.ts` (derivado del enum); `ticketStatus` de `db/schema/enums` (solo tipo, como hace `payment.types.ts`).
- `EventCover` para las portadas; `TicketPass`, `TicketDetailCard`, `OrderConfirmation`, `MyTickets` (se editan, no se rehacen); `splitOrdersByDate` y sus casos de test (se mueven a `order.utils.ts`).
- `jspdf` y la lógica de PDF/ICS de `ticket-export.ts` (`buildIcs`, `toFileName`, `downloadFile`, maquetación del PDF); solo cambia el origen del QR y de los datos.
- `src/lib/utils.ts` (`cn`), `Button`, `Link`, patrón `{ ok, data } | { ok: false, error }` de las actions.
- `usePersistHydration` (`src/lib/use-persist-hydration.ts`) queda en `CheckoutForm`.

## Archivos

Nuevos:

- `src/modules/booking/order.types.ts` (T0)
- `src/modules/booking/order.schema.ts`, `order.schema.test.ts` (T1)
- `src/modules/booking/order.utils.ts`, `order.utils.test.ts` (T1)
- `src/modules/booking/services/order-data-service.ts` (T1)
- `src/modules/booking/hooks/use-my-order.ts`, `use-my-order.test.ts` (T1)
- `src/lib/qr.ts`, `src/lib/qr.test.ts` (T2)
- `src/components/ui/QrCode.tsx` (T2)
- `src/modules/booking/components/TicketQr.tsx`, `src/modules/booking/components/ticket-status-labels.ts` (T2)

Modificados:

- `package.json`, `package-lock.json` (T0)
- `src/modules/booking/services/order-service.ts`, `order-service.test.ts` (T1: reescritura; se va `MOCK_ORDERS`)
- `src/modules/booking/actions.ts` (T1: agrega `getMyOrderAction`)
- `src/modules/booking/ticket-export.ts`, `ticket-export.test.ts` (T2)
- `src/modules/booking/components/TicketPass.tsx`, `TicketDetailCard.tsx` (T2)
- `src/app/(platform)/events/[slug]/confirmation/page.tsx` (T3)
- `src/modules/booking/components/OrderConfirmation.tsx`, `CheckoutForm.tsx` (T3)
- `src/modules/booking/booking.store.ts`, `booking.store.test.ts`, `booking.types.ts` (T3)
- `src/app/(platform)/my-tickets/page.tsx`, `src/modules/booking/components/MyTickets.tsx` (T4)
- `src/modules/event/services/event-service.ts` (T4: solo el comentario de cabecera, que dice que alimenta "Mis entradas")

Eliminados:

- `src/components/ui/qr-pattern.tsx` (T2)

### Contratos fijados (para que T1 y T2 corran en paralelo; los crea T0)

`src/modules/booking/order.types.ts` (solo tipos; sin `Date`, todo serializable):

```ts
import type { ticketStatus } from "@/db/schema/enums"; // solo tipo, como payment.types.ts
import type { OrderStatus } from "@/modules/payment/payment.types";

export type TicketStatus = (typeof ticketStatus.enumValues)[number];

export interface MyTicket {
  id: string;
  /** Token del QR: `ticket.code` crudo. */
  code: string;
  zoneName: string;
  /** Solo zonas numeradas, p. ej. "Fila A · 4"; null en GA. */
  seatLabel: string | null;
  holderName: string;
  status: TicketStatus;
}

/** Evento de la orden: forma compatible con `ExportEvent` + portada. */
export interface MyOrderEvent {
  id: string;
  slug: string;
  title: string;
  category: string;
  /** "" = sin portada (usar `EventCover`). */
  imageUrl: string;
  imageAlt: string;
  /** "YYYY-MM-DD" y "HH:mm" en Lima. */
  date: string;
  startsAt: string;
  venue: string;
  address: string;
  city: string;
  currency: string;
}

export interface MyOrder {
  id: string;
  /** "TK-" + 8; lo que ve el comprador como "Pedido N.º". */
  code: string;
  status: OrderStatus;
  /** Unidades de moneda (`total_cents / 100`), como el resto de la UI. */
  total: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  event: MyOrderEvent;
  /** Vacío mientras la orden está `pending`. */
  tickets: MyTicket[];
}

export type MyOrderResult = { ok: true; data: MyOrder | null } | { ok: false; error: string };

/** Qué muestra la confirmación. */
export type ConfirmationView = "not-found" | "processing" | "timed-out" | "ready" | "failed";
```

Firmas de T1 que consumen T3 y T4:

```ts
// order.schema.ts
export const orderCodeSchema: z.ZodString; // "TK-" + 8 del alfabeto de generateOrderCode
// order.utils.ts
export const ORDER_MESSAGES: { invalid: string; generic: string };
export const ORDER_POLL_INTERVAL_MS = 2000;
export const ORDER_POLL_MAX_POLLS = 30; // ~60 s
export interface OrderTicketRow { /* una fila por ticket: columnas del join de order-data-service */ }
export function toMyOrders(rows: OrderTicketRow[]): MyOrder[];
export function splitOrdersByDate(orders: MyOrder[], today: string): { upcoming: MyOrder[]; past: MyOrder[] };
export function getConfirmationView(order: MyOrder | null | undefined, hasTimedOut: boolean): ConfirmationView;
export function getOrderPollInterval(order: MyOrder | null | undefined, polls: number): number | false;
// services/order-service.ts
export function listMyOrders(userId: string): Promise<MyOrder[]>;
export function findMyOrder(userId: string, code: string): Promise<MyOrder | null>;
// actions.ts
export function getMyOrderAction(input: unknown): Promise<MyOrderResult>;
// hooks/use-my-order.ts
export const myOrderQueryKey: (code: string) => readonly ["my-order", string];
export function fetchMyOrder(code: string): Promise<MyOrder | null>;
export function useMyOrder(code: string, initialOrder: MyOrder): { order: MyOrder; view: ConfirmationView; error: Error | null; retry: () => void };
```

## Decisiones

- **D1 Identificación de la orden**: `?order=<code>` obligatorio (el `code` `TK-…` ya lo devuelve `startCheckoutAction`). Sin parámetro, con formato inválido o de otro usuario: vista `not-found` ("No encontramos tu compra") con enlace a "Mis entradas". Sin fallback a "la última orden del evento" (por defecto; Pregunta 1).
- **D2 Autorización**: `findMyOrder(userId, code)` hace `WHERE orders.code = ? AND orders.user_id = ?`; una orden ajena es indistinguible de una inexistente (`null`). `getMyOrderAction` obtiene el usuario con `requireRole("customer")`; el input solo trae `code`. La página de confirmación y la de Mis entradas son Server Components con `requireRole("customer")` (sin sesión redirige a iniciar sesión).
- **D3 Lectura**: un único `select` en `order-data-service.ts` con joins explícitos, una fila por `ticket`: `ticket ⨝ order_item ⨝ orders ⨝ event ⨝ venue ⨝ category ⨝ event_zone ⟕ event_seat ⟕ venue_seat`, filtrado por `orders.user_id` (y `orders.code` en `findMyOrder`). `listMyOrders` filtra `orders.status IN ('paid','partially_refunded','refunded')`; ordena por `orders.paid_at DESC NULLS LAST, orders.id` y dentro de la orden por `event_zone.name, venue_seat.row_label, venue_seat.seat_number, ticket.id`. Como una orden `pending` no tiene tickets, `findMyOrder` necesita además una consulta de la orden sola (sin tickets) para devolverla con `tickets: []`; las dos consultas viven en el data service y `toMyOrders` mapea ambas formas. El mapeo (cents → unidades, `toLimaDate`/`toLimaTime`, `"Fila A · 4"`, `cover_image_url null → ""`, agrupar filas por orden respetando el orden) es puro y vive en `order.utils.ts`.
- **D4 Estado "procesando"**: `status === "pending"` (o `paid` sin tickets, que no debería ocurrir: se trata como procesando). `getOrderPollInterval` devuelve 2000 ms mientras la orden esté en ese estado y `polls < 30`, `false` en cualquier otro caso. `useMyOrder` usa `useQuery({ queryKey, queryFn: () => fetchMyOrder(code), initialData: initialOrder, refetchInterval: (q) => getOrderPollInterval(q.state.data, polls) })`; el contador de consultas lo lleva el hook sin leer `Date.now()` en el render (por ejemplo, `q.state.dataUpdateCount`). `ConfirmationView` sale de `getConfirmationView(order, hasTimedOut)`: `pending` → `processing` (o `timed-out` tras el tope), `cancelled`/`failed` → `failed`, con tickets → `ready`. Si `fetchMyOrder` lanza y el último dato sigue `pending`, el hook expone `error` y la vista ofrece "Reintentar" (`refetch`). Con `initialData` y el `staleTime` global de 30 s no hay consulta inmediata al montar: el primer refetch lo dispara `refetchInterval`.
- **D5 Próximas vs. pasadas**: por `event.date` ("YYYY-MM-DD" en Lima). `date >= today` es próxima (el día del evento cuenta como próxima, ordenadas por `date` y luego `startsAt` ascendente); si no, pasada (más reciente primero). `today = toLimaDate(new Date())` se calcula en `my-tickets/page.tsx` y baja como prop: desaparece `todayIso()` y el desfase por zona horaria del navegador. No hay órdenes de eventos desconocidos: el join los garantiza.
- **D6 Librería de QR**: `uqr` (MIT, sin dependencias, TypeScript) en `dependencies` (T0). `src/lib/qr.ts` expone `buildQrMatrix(text: string): boolean[][]` (nivel de corrección M, sin borde) y `QR_QUIET_ZONE = 4`. `QrCode.tsx` (ui, sin lógica de dominio) renderiza esa matriz como `<svg>` con fondo blanco y zona de silencio de 4 módulos (`role="img"`, `aria-label`), sin `dangerouslySetInnerHTML`. El PDF dibuja la misma matriz con su zona de silencio. Se verifica el nombre exacto de la exportación (`encode`) tras instalar; plan B documentado en Preguntas abiertas 2.
- **D7 Payload del QR**: `ticket.code` crudo (22 caracteres base64url, distingue mayúsculas; `§5.3` compara `code` exacto). Nada más (sin URL ni prefijo).
- **D8 Estado de la entrada**: `TicketQr` muestra el QR solo si `ticket.status === "valid"`; en `used`/`cancelled`/`refunded` muestra un recuadro del mismo tamaño con la etiqueta de estado (`ticket-status-labels.ts`: Válida, Usada, Cancelada, Reembolsada). `TicketDetailCard` reemplaza el "Válida" fijo por esa etiqueta. El campo "Código" del detalle sigue siendo `${order.code}-NN` (referencia legible; el `ticket.code` secreto solo viaja en el QR). "Titular" pasa a `ticket.holderName`.
- **D9 PDF e ICS**: `downloadTicketsPdf(event, order)` genera una página por entrada `valid` (nombre `entradas-<order.code>.pdf`), con el QR real; se elimina la leyenda "Entrada de demostración, sin validez". Si no hay entradas `valid`, los botones de PDF se deshabilitan. `buildIcs(event, order: Pick<MyOrder, "code" | "tickets">, now)` usa `order.code` en `UID` y la cantidad de `order.tickets`. `getOrderTickets`/`OrderTicket` (con `seed`) desaparecen.
- **D10 Limpieza de `booking.store`**: se quitan `lastOrder`, `orders`, `confirmOrder`, `ConfirmOrderInput`, `createOrderId`, y esos campos de `partialize` y de `reset`. Se conserva la selección persistida, `getOrderLines` y `getOrderTotals` (los usan `CheckoutForm` y `CheckoutSummary`). `persist` sube a `version: 1` con `migrate` (función pura exportada, `migrateBookingState`) que conserva solo `eventId`, `activeZoneId`, `seats`, `quantities`: así el `localStorage` de quien ya compró deja de contener nombre y correo. `booking.types.ts` pierde `Order` y `PaymentMethod`; conserva `OrderLine`, `Seat`, `Zone`, etc.
- **D11 Tras pagar**: `CheckoutForm` llama a `reset()` del store (la selección ya está convertida en orden; antes la limpiaba `confirmOrder`) y navega a `/events/${slug}/confirmation?order=${encodeURIComponent(code)}`. El `returnUrl` de Stripe queda sin `order` (se fija antes de conocer el código); un redirect de 3DS llegaría a la vista `not-found`, que enlaza a Mis entradas (tarjetas sin redirect son el caso normal con `redirect: "if_required"`).
- **D12 Portadas**: `MyTickets` (miniatura) y `TicketDetailCard` (cabecera) usan `EventCover` dentro de un contenedor `relative`; `TicketPass` ya lo usa.
- **D13 Moneda y montos**: `MyOrder.total = total_cents / 100`; se muestra con `formatEventPrice(order.total, order.currency)`. Es el total pagado (incluye comisión de plataforma), igual que "Total pagado" hoy.

## Criterios de aceptación

- AC1: `/events/[slug]/confirmation?order=<code>` lee la orden del usuario autenticado desde la DB (`findMyOrder`) y no depende de `useBookingStore`, `localStorage` ni de `getPublicEventDetail`; tampoco responde 404 cuando el evento ya empezó.
- AC2: `findMyOrder` y `listMyOrders` filtran por `orders.user_id`; pedir el `code` de otro usuario devuelve `null` y la UI muestra "No encontramos tu compra" sin ningún dato ajeno (test del service: el `userId` llega al data service; test del mapeo).
- AC3: con la orden `pending`, la confirmación muestra "Procesando tu pago…" (no "¡Compra confirmada!"), consulta cada 2 s (`getOrderPollInterval` = 2000) y deja de consultar al salir de `pending` o tras 30 consultas (~60 s).
- AC4: con la orden `paid` y tickets, muestra "¡Compra confirmada!", el `code` del pedido, el total pagado real, una entrada por ticket con su zona y asiento (`Fila A · 4` solo en zonas numeradas) y el QR de cada una; el estado pasa de procesando a listo sin recargar la página.
- AC5: pasado el tope con la orden aún `pending`, muestra "Tu pago sigue procesándose" con enlaces a "Mis entradas" y aviso de que la entrada llegará cuando se confirme; no sigue consultando.
- AC6: con la orden `cancelled` o `failed` muestra un estado de error ("No pudimos completar tu compra…", con la nota de reembolso automático si hubo cargo) y un enlace para volver al evento (`/events/<slug>`); no muestra QR ni "¡Compra confirmada!".
- AC7: si la consulta falla mientras la orden sigue `pending`, se muestra un mensaje de error y un botón "Reintentar"; no se muestran datos inventados.
- AC8: `/my-tickets` lista las órdenes del usuario con entradas (`paid`, `partially_refunded`, `refunded`) desde la DB; no aparecen órdenes `pending`/`cancelled`/`failed`; las pestañas "Próximas (n)" y "Pasadas (n)" separan por `event.date` en Lima (el día del evento es próxima), con el orden de D5; `today` se calcula en el servidor.
- AC9: Mis entradas muestra por orden: portada (o placeholder), evento, fecha, ciudad, cantidad de entradas y zonas; el detalle muestra una entrada por vez con QR, zona, asiento, titular (`holderName`), código `${order.code}-NN` y el estado real de la entrada.
- AC10: el QR de cada entrada `valid` codifica exactamente `ticket.code` (22 caracteres), con zona de silencio de 4 módulos, y es el mismo en pantalla y en el PDF; las entradas `used`/`cancelled`/`refunded` no muestran QR sino su estado.
- AC11: "Descargar PDF" genera una página por entrada `valid` con el QR real y sin leyenda de demostración; "Agregar al calendario" genera un `.ics` con `UID` basado en `order.code`; con cero entradas `valid` el PDF está deshabilitado.
- AC12: no quedan `MOCK_ORDERS`, `getMyOrders`, `qr-pattern.tsx`/`QrPattern`/`buildQrCells`/`QR_SIZE`, `Order`/`PaymentMethod` de `booking.types.ts`, ni `lastOrder`/`orders`/`confirmOrder`/`createOrderId` en `src` (verificable con `grep`); `event-service.ts` y sus consumidores (`seed-data.ts`, `venue-service.ts`) siguen intactos.
- AC13: al pagar, `CheckoutForm` limpia la selección (`reset()`) y navega a la confirmación con `?order=<code>`; `usePersistHydration` se conserva; `migrateBookingState` descarta `orders` y `lastOrder` de un `localStorage` previo y conserva la selección.
- AC14: sin sesión, `/events/[slug]/confirmation` y `/my-tickets` redirigen a iniciar sesión; `getMyOrderAction` también exige sesión.
- AC15 (manual, "listo cuando"): con `stripe listen` reenviando a `/api/webhooks/stripe`, pagar una entrada con la tarjeta de prueba `4242 4242 4242 4242`: la confirmación pasa de "procesando" a "confirmada"; abrir `/my-tickets` en un segundo navegador (o ventana privada) con la misma cuenta de Clerk muestra la orden; escanear el QR con un celular decodifica el texto y coincide con `ticket.code` en la DB (`npm run db:studio`).
- AC16: `npx vitest run`, `npm run lint`, `npx tsc --noEmit` y `npm run build` pasan.

## Tests requeridos

Vitest, `.test.ts` junto al archivo. Sin tests de componentes ni de `order-data-service.ts` (queries; igual que `checkout-data-service.ts`) ni de `actions.ts` (igual que el resto de actions).

- `order.schema.test.ts`: `orderCodeSchema` acepta códigos de `generateOrderCode()` y rechaza vacío, prefijo distinto, longitud ≠ 8, minúsculas y caracteres fuera del alfabeto.
- `order.utils.test.ts`:
  - `toMyOrders`: agrupa filas por orden conservando el orden; una orden con 2+ tickets; `total_cents` → unidades (`12550` → `125.5`); `date`/`startsAt` en Lima (un `starts_at` en UTC que cae al día siguiente cambia a la fecha de Lima); `seatLabel` `"Fila A · 4"` en zona numerada y `null` en GA; `cover_image_url` `null` → `""`; orden `pending` sin filas de ticket → `tickets: []`.
  - `splitOrdersByDate`: los 3 casos existentes (separa y ordena, el día de hoy es próxima) adaptados a `MyOrder`, más desempate por `startsAt`.
  - `getConfirmationView`: `null` → `not-found`; `pending` → `processing`/`timed-out`; `paid` con tickets → `ready`; `paid` sin tickets → `processing`; `cancelled`/`failed` → `failed`; `partially_refunded`/`refunded` con tickets → `ready`.
  - `getOrderPollInterval`: 2000 en `pending` con `polls < 30`; `false` en `paid`, `cancelled`, `null`/`undefined` y con `polls >= 30`.
- `services/order-service.test.ts` (reescrito, `vi.mock` de `order-data-service`): `listMyOrders` pasa el `userId` al data service y devuelve las órdenes mapeadas; `findMyOrder` pasa `userId` y `code` y devuelve `null` cuando no hay orden (ajena o inexistente); una orden `pending` sin filas de ticket se devuelve con `tickets: []`.
- `hooks/use-my-order.test.ts` (patrón de `use-events.test.ts`, mock de `@/modules/booking/actions`): `myOrderQueryKey` cambia por `code`; `fetchMyOrder` devuelve la orden, devuelve `null`, y lanza el mensaje del servidor si `!ok`.
- `src/lib/qr.test.ts`: `buildQrMatrix` es cuadrada, es determinista, cambia con otro texto, tiene el patrón de búsqueda (7×7 con anillo exterior y centro 3×3) en las tres esquinas, y un `ticket.code` de 22 caracteres produce la misma versión de QR (mismo tamaño); `QR_QUIET_ZONE` es 4.
- `ticket-export.test.ts` (reescrito): `buildIcs` con `MyOrder` (UID `<code>@ticketera`, "N entradas" según `tickets.length`, escape de comas y punto y coma, `DTEND` cruzando medianoche); `toFileName`. Se eliminan los casos de `getOrderTickets`.
- `booking.store.test.ts`: se eliminan `describe("confirmOrder")` y la línea `useBookingStore.setState({ orders: [] })` del `beforeEach`; se agrega `migrateBookingState` (conserva selección, descarta `orders`/`lastOrder`, tolera `null`/valores no objeto); `reset` ya no toca órdenes.

## Tareas

### T0 — Base: dependencia de QR y contrato de tipos
- Archivos: `package.json`, `package-lock.json`, `src/modules/booking/order.types.ts`
- Depende de: —
- Paralelizable: no (T1 y T2 dependen de ella; es chica)
- Cubre: base de AC1–AC11
- Detalle: `npm install uqr`; crear `order.types.ts` exactamente como en "Contratos fijados". Sin `npx shadcn add` ni cambios de layout.

### T1 — Lectura de órdenes: schema, utils, services, action y hook
- Archivos: `src/modules/booking/order.schema.ts`, `order.schema.test.ts`, `order.utils.ts`, `order.utils.test.ts`, `services/order-data-service.ts`, `services/order-service.ts`, `services/order-service.test.ts`, `actions.ts`, `hooks/use-my-order.ts`, `hooks/use-my-order.test.ts` (todo bajo `src/modules/booking/`)
- Depende de: T0
- Paralelizable: sí, con T2
- Cubre: AC1–AC3, AC5–AC8, AC14 (lógica), AC16
- Detalle: reescribir `order-service.ts` (sin `MOCK_ORDERS`, `getMyOrders` ni imports de `event-service`/tipo `Order`); `splitOrdersByDate` se mueve a `order.utils.ts`; `getMyOrderAction` sigue el patrón de `startCheckoutAction` (`requireRole("customer")`, `orderCodeSchema.safeParse`, `try/catch` con `console.error` sin datos personales y `ORDER_MESSAGES.generic`).

### T2 — QR real, exportación y tarjetas de entrada
- Archivos: `src/lib/qr.ts`, `src/lib/qr.test.ts`, `src/components/ui/QrCode.tsx`, `src/components/ui/qr-pattern.tsx` (eliminar), `src/modules/booking/ticket-export.ts`, `src/modules/booking/ticket-export.test.ts`, `src/modules/booking/components/TicketQr.tsx`, `src/modules/booking/components/ticket-status-labels.ts`, `src/modules/booking/components/TicketPass.tsx`, `src/modules/booking/components/TicketDetailCard.tsx`
- Depende de: T0
- Paralelizable: sí, con T1
- Cubre: AC9–AC12 (parte), AC16
- Detalle: `ticket-export.ts` pasa a `MyOrder`/`MyTicket` (`ExportEvent` = `Pick<MyOrderEvent, …>`), importa `buildQrMatrix`/`QR_QUIET_ZONE` de `@/lib/qr` y filtra por `valid`; `TicketPass` y `TicketDetailCard` reciben `MyTicket`/`MyOrder`/`MyOrderEvent` y usan `TicketQr` (QR o estado) y `EventCover`.

### T3 — Confirmación real y limpieza del store
- Archivos: `src/app/(platform)/events/[slug]/confirmation/page.tsx`, `src/modules/booking/components/OrderConfirmation.tsx`, `src/modules/booking/components/CheckoutForm.tsx`, `src/modules/booking/booking.store.ts`, `src/modules/booking/booking.store.test.ts`, `src/modules/booking/booking.types.ts`
- Depende de: T1, T2
- Paralelizable: sí, con T4
- Cubre: AC1–AC7, AC12–AC14, AC16
- Detalle: la página (`requireRole("customer")`, lee `searchParams.order`, valida con `orderCodeSchema`, `findMyOrder` para el dato inicial) deja de llamar a `getPublicEventDetail`; `OrderConfirmation` recibe la orden inicial (o `null`) y usa `useMyOrder` solo si existe; `CheckoutForm` quita `confirmOrder`, llama a `reset()` y navega con `?order=`.

### T4 — Mis entradas con datos reales
- Archivos: `src/app/(platform)/my-tickets/page.tsx`, `src/modules/booking/components/MyTickets.tsx`, `src/modules/event/services/event-service.ts` (solo el comentario de cabecera)
- Depende de: T1, T2
- Paralelizable: sí, con T3
- Cubre: AC8, AC9, AC12, AC14, AC16
- Detalle: la página (`requireRole("customer")`) llama a `listMyOrders(user.id)` y calcula `today = toLimaDate(new Date())`; `MyTickets` recibe `{ orders, today }`, usa `splitOrdersByDate`, ya no usa `useBookingStore`, `usePersistHydration`, `events`, `sampleOrders` ni `buyer`; sin imports de `event-service`.

## Preguntas abiertas

Cada una trae un valor por defecto; si no hay respuesta, se aplica.

1. **¿`?order=` obligatorio o fallback a la última orden del usuario para ese evento?** Por defecto: obligatorio, sin fallback (D1). Alternativa: si falta, mostrar la orden más reciente del usuario para el evento (más tolerante con un redirect de 3DS, pero ambigua si el usuario tiene una orden anterior abandonada del mismo evento).
2. **Librería de QR.** Por defecto `uqr` (devuelve la matriz que necesita el PDF). Si al instalarla no exporta `encode` con la forma esperada, plan B: `qrcode` (+ `@types/qrcode`) con `QRCode.create(text).modules`; descartada `qrcode.react` porque no expone la matriz y obligaría a rasterizar un `<canvas>` para el PDF.
3. **Estados de orden que aparecen en Mis entradas.** Por defecto: `paid`, `partially_refunded` y `refunded` (órdenes con tickets; las reembolsadas muestran el estado de cada entrada). Alternativa: ocultar `refunded`. Las órdenes `pending`/`cancelled`/`failed` no aparecen (D3).
4. **Tope y mensaje de "procesando".** Por defecto: 2 s de intervalo y 30 consultas (~60 s), luego "Tu pago sigue procesándose… aparecerá en Mis entradas". Se pueden ajustar las constantes sin cambiar el diseño.
5. **Entradas que no son `valid`.** Por defecto: no se muestra QR, solo la etiqueta de estado (D8), y el PDF solo incluye las `valid`. Alternativa: seguir mostrando el QR atenuado también para `used`.
6. **Correo de confirmación.** El texto "Enviamos tus entradas a {email}" y el paso "Revisa tu correo" se mantienen, pero ningún correo se envía todavía (tarjeta aparte). Por defecto: dejar el texto; alternativa: cambiarlo a "Las tienes siempre en Mis entradas" hasta que exista el envío.
7. **Código visible.** Por defecto el detalle muestra `${order.code}-NN` y nunca el `ticket.code` en texto (es el secreto del QR). Alternativa: mostrar también los últimos 4 caracteres del `ticket.code` como referencia de soporte.
8. **Cualquier divergencia con `system-design.md`.** §5.1 paso 4 menciona `orders.failed`/`cancelled`; el webhook (08) deja `cancelled` en el camino de reembolso. La UI trata ambos como `failed`. No se modifica ningún doc de arquitectura.

## Próximas fases

- Envío del correo de confirmación con las entradas (y entonces mantener o ajustar el texto de la Pregunta 6).
- Tarjeta 12: reembolsos (`charge.refunded`, `refund`/`refund_ticket`) y su reflejo en `ticket.status`/`orders.status`.
- Check-in: escáner del organizador que consume `ticket.code` (`§5.3`) y marca `used`.
- Mostrar en Mis entradas las órdenes `pending` ("pago en proceso") si se requiere.
- Eliminar `event-service.ts` (mock) cuando `seed-data.ts` y `venue-service.ts` dejen de depender de él.
- Si se necesita fallback al volver de un redirect de 3DS: incluir el código de orden en el `returnUrl` creando la orden antes de montar el Payment Element.
