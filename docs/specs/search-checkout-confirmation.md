# Búsqueda y listado, checkout y confirmación de compra (mock data)

Estado: aprobada

## Objetivo

Construir, solo UI/UX y con mock data, las pantallas 2, 5 y 6 del diseño de Claude Design ("Ticketera Landing Redesign"), en escritorio y móvil:

- **Búsqueda y listado** (`Search`, `SearchMobile`).
- **Checkout y pago** (`Checkout`, `CheckoutMobile`).
- **Confirmación de compra** (`Confirmation`, `ConfirmationMobile`).

Cierra el flujo de compra iniciado en `docs/specs/event-detail-seat-selection.md`: la selección del `booking.store` llega al checkout y el pago simulado genera un pedido que muestra la confirmación. Sigue `docs/design/design-system.md` sin re-decidirlo.

## Alcance

- Incluye:
  - **`/events` — búsqueda y listado.**
    - Buscador superior (texto, fecha, precio) reutilizando `EventSearchForm`.
    - Filtros:
      - Categoría y ciudad: checkboxes con conteo.
      - Mes: radio.
      - Precio desde: radio.
    - Chips de filtros activos (quitables) y "Limpiar".
    - Orden: "Fecha" o "Precio más bajo".
    - Contador de resultados, grilla de resultados y estado vacío.
    - Los filtros viven en la URL, así que son compartibles y se renderizan en servidor.
    - En escritorio los filtros van en una columna lateral. En móvil van en un panel a pantalla completa (`Sheet`) con "Ver N resultados", más una fila de categorías rápidas.
  - **Buscador de la landing funcional**: "Buscar" navega a `/events` con los parámetros elegidos. El link "Eventos" del Navbar apunta a `/events`.
  - **`/events/[id]/checkout` — datos y pago.**
    - Header de pasos (paso 2, con check en el paso 1).
    - Aviso con temporizador de reserva de 10:00.
    - Datos del comprador: nombre, correo, tipo y número de documento, celular.
    - Método de pago:
      - Tarjeta: número, vencimiento, CVV y nombre.
      - Yape y PagoEfectivo: texto informativo.
    - Aceptación de términos.
    - Resumen con "Cambiar entradas" y botón "Pagar S/ X". En móvil el resumen es plegable y el pago va en una barra fija inferior.
    - Validación con `zod`, con errores por campo al enviar.
    - Si no hay entradas seleccionadas o la reserva expira, se muestra un estado vacío con link a `/events/[id]/tickets`.
  - **Pago simulado**: al enviar un formulario válido se crea un pedido mock en el store (número `TK-XXXXX`), se limpia la selección y se navega a la confirmación.
  - **`/events/[id]/confirmation` — compra confirmada.**
    - Header (paso 3), título "¡Compra confirmada!" y número de pedido.
    - Tarjeta de entrada con patrón QR decorativo: zona, entradas, total pagado y "Entrada N de M", navegable entre entradas.
    - Botones "Ver mis entradas", "Agregar al calendario" y "Descargar PDF" (visuales).
    - Tres pasos de "Qué sigue".
    - Sin pedido en el store: estado vacío con link al inicio.
  - "Continuar" en `/events/[id]/tickets` pasa a ser un link al checkout.
- No incluye:
  - Pagos reales, validación de tarjeta con pasarela, envío de correo, generación de PDF o `.ics`.
  - QR real: es un patrón decorativo determinista, igual que en el diseño.
  - Persistencia: al recargar la página se pierde la selección o el pedido y se ve el estado vacío (ver preguntas abiertas).
  - "Mis entradas", login y panel de organizador (próximas fases).
  - Paginación de resultados (el catálogo mock tiene 10 eventos).

## Reutilizar

- `EventSearchForm` (buscador del hero): se vuelve funcional y se usa también en `/events`.
- `EventCard` y `EventGrid` para los resultados. `EventGrid` gana una prop opcional para el número de columnas o el estado vacío si hace falta; no se duplica la card.
- `getUpcomingEvents`, `getCategories` y `formatEventPrice`/`formatEventDateParts` del módulo `event`.
- `booking.store` (`getOrderLines`, `getOrderTotals`, `MAX_TICKETS_PER_ZONE`), `CheckoutHeader`, `Logo`, `SiteHeader` y `Footer`.
- shadcn ya instalados: `button`, `input`, `select`, `sheet`, `badge`, `separator`, `popover` y `calendar`.
- `zod` (ya instalado) para validar el checkout.

## Archivos

**T1 (búsqueda — lógica):**
- `src/modules/event/event.types.ts` (modificado — `EventSearchFilters`, `EventSort`)
- `src/modules/event/event-search.ts` (nuevo — opciones de precio y mes, parseo y serialización de searchParams, `filterEvents`, `sortEvents`, conteos por faceta)
- `src/modules/event/event-search.test.ts` (nuevo)
- `src/modules/event/services/event-service.ts` (modificado — `searchEvents(filters)`, `getCities()`)
- `src/modules/event/services/event-service.test.ts` (modificado)

**T2 (búsqueda — UI):**
- `src/app/events/page.tsx` (nuevo)
- `src/modules/event/components/EventFilters.tsx` (nuevo — client; aside de escritorio y `Sheet` en móvil)
- `src/modules/event/components/ActiveFilterChips.tsx` (nuevo)
- `src/modules/event/components/SortToggle.tsx` (nuevo)
- `src/modules/event/hooks/use-event-search-params.ts` (nuevo — lee y actualiza la URL con `useRouter`/`useSearchParams`)
- `src/modules/event/components/EventSearchForm.tsx` (modificado — submit navega a `/events`)
- `src/modules/event/components/EventGrid.tsx` (modificado — solo si hace falta la variante de 3 columnas o el estado vacío)
- `src/components/Navbar.tsx` (modificado — "Eventos" apunta a `/events`)

**T3 (checkout — lógica):**
- `src/modules/booking/checkout.schema.ts` (nuevo — `checkoutSchema` con zod: comprador, método y datos de tarjeta condicionales, términos)
- `src/modules/booking/checkout.schema.test.ts` (nuevo)
- `src/modules/booking/booking.store.ts` (modificado — `reservationExpiresAt`, `confirmOrder`, `lastOrder`)
- `src/modules/booking/booking.store.test.ts` (modificado)
- `src/modules/booking/booking.types.ts` (modificado — `PaymentMethod`, `Order`)

**T4 (checkout — UI):**
- `src/app/events/[id]/checkout/page.tsx` (nuevo)
- `src/modules/booking/components/CheckoutForm.tsx` (nuevo — client, compone todo el paso 2)
- `src/modules/booking/components/PaymentMethodPicker.tsx` (nuevo)
- `src/modules/booking/components/ReservationTimer.tsx` (nuevo)
- `src/modules/booking/components/CheckoutSummary.tsx` (nuevo — aside en escritorio, plegable en móvil)
- `src/modules/booking/components/CheckoutHeader.tsx` (modificado — pasos completados con check)
- `src/modules/booking/components/OrderSummary.tsx` (modificado — "Continuar" pasa a link al checkout)

**T5 (confirmación — UI):**
- `src/app/events/[id]/confirmation/page.tsx` (nuevo)
- `src/modules/booking/components/OrderConfirmation.tsx` (nuevo — client, lee `lastOrder`)
- `src/modules/booking/components/TicketPass.tsx` (nuevo — tarjeta de entrada con talón perforado)
- `src/components/ui/qr-pattern.tsx` (nuevo — patrón QR decorativo determinista a partir de un seed, genérico)

## Criterios de aceptación

- AC1: `npm run lint`, `npx tsc --noEmit` y `npx vitest run` pasan. `/events`, `/events/evt-001/checkout` y `/events/evt-001/confirmation` renderizan. Un id de evento inexistente da 404.
- AC2: `/events` lista los eventos del catálogo ordenados por fecha. El texto busca en título, lugar y ciudad, sin distinguir mayúsculas ni tildes. Los filtros se combinan con Y entre facetas y con O dentro de una faceta (varias categorías o varias ciudades).
- AC3: Cada filtro y el orden se reflejan en la URL (`q`, `categoria`, `ciudad`, `mes`, `precio`, `desde`, `orden`), y la página se renderiza igual al recargar o compartir el link. `categoria` usa los mismos ids que la landing (`cat-conciertos`…).
- AC4: Los chips de filtros activos se quitan de a uno y "Limpiar" quita todos. El contador dice "N eventos" o "1 evento". Sin resultados se muestra "No encontramos eventos con esos filtros" con botón "Limpiar filtros".
- AC5: En móvil (<1024px) los filtros abren en un `Sheet` a pantalla completa con botón "Ver N resultados". Hay una fila de categorías rápidas con scroll horizontal y no hay scroll horizontal de página.
- AC6: El buscador de la landing navega a `/events?q=…&precio=…&desde=…`, y en `/events` aparece precargado con los valores actuales.
- AC7: En `/events/[id]/tickets`, "Continuar" con al menos 1 entrada navega a `/events/[id]/checkout`. En el checkout:
  - El resumen muestra las líneas de la selección, el total y "Cambiar entradas".
  - El temporizador descuenta desde 10:00. Al llegar a 0 se muestra "Tu reserva expiró" con link para volver a elegir.
- AC8: "Pagar S/ X" está deshabilitado hasta aceptar los términos. Al enviar con errores, cada campo inválido muestra su mensaje (`aria-invalid`, `aria-describedby`) y el foco va al primero. Con tarjeta se validan número (13–19 dígitos), vencimiento `MM/AA` no vencido y CVV (3–4 dígitos). Con Yape o PagoEfectivo no se piden datos de tarjeta.
- AC9: Un envío válido crea un pedido `TK-` más 5 dígitos con evento, líneas, total, método y correo, limpia la selección y navega a `/events/[id]/confirmation`.
- AC10: La confirmación muestra el número de pedido, una tarjeta por entrada con "Entrada N de M" (anterior/siguiente), zona (y asiento si es numerado) y total pagado, además de los botones y los tres pasos del diseño. Sin pedido del evento se muestra un estado vacío con link al inicio.
- AC11: Accesibilidad y responsive en las tres pantallas:
  - Labels reales en todos los campos, `fieldset`/`legend` en grupos de radios y checkboxes.
  - Foco visible y áreas táctiles de al menos 44px.
  - Sin scroll horizontal entre 375px y 1440px.
  - Barras fijas inferiores en móvil que no tapan contenido.

## Tests requeridos

- `src/modules/event/event-search.test.ts`: parseo y serialización de searchParams (valores repetidos, desconocidos o vacíos), filtro por texto con y sin tildes, categoría, ciudad, mes, precio y `desde`, combinaciones Y/O, orden por fecha y por precio, y conteos por faceta.
- `src/modules/event/services/event-service.test.ts`: `searchEvents` aplica filtros y orden; `getCities` devuelve ciudades únicas.
- `src/modules/booking/checkout.schema.test.ts`: datos válidos con cada método; errores de correo, documento, celular, tarjeta, vencimiento pasado, CVV y términos no aceptados.
- `src/modules/booking/booking.store.test.ts`: `confirmOrder` guarda `lastOrder` con líneas y total correctos, genera el formato `TK-\d{5}` y limpia la selección.
- Sin tests de componentes visuales (SETUP.md los exime).

## Tareas

### T1 — Búsqueda: filtros, orden y servicio
- Archivos: `src/modules/event/event.types.ts`, `src/modules/event/event-search.ts`, `src/modules/event/event-search.test.ts`, `src/modules/event/services/event-service.ts`, `src/modules/event/services/event-service.test.ts`
- Depende de: —
- Paralelizable: sí (con T3)
- Cubre: AC2, AC3, AC4
- Notas:
  - Funciones puras en `event-search.ts`: `parseSearchParams(searchParams) → EventSearchFilters`, `toSearchParams(filters)`, `filterEvents`, `sortEvents` y `getFacetCounts`.
  - Rangos de precio con las mismas claves que ya usa `EventSearchForm` (`under-50`, `50-150`, `150-300`, `over-300`), exportados para compartirlos.
  - El precio compara el `priceFrom` numérico sin convertir moneda. Es mock: se anota en un comentario.

### T2 — Búsqueda: página y componentes
- Archivos: `src/app/events/page.tsx`, `src/modules/event/components/{EventFilters,ActiveFilterChips,SortToggle}.tsx`, `src/modules/event/hooks/use-event-search-params.ts`, `src/modules/event/components/EventSearchForm.tsx`, `src/modules/event/components/EventGrid.tsx`, `src/components/Navbar.tsx`
- Depende de: T1
- Paralelizable: sí (con T4 y T5)
- Cubre: AC1–AC6, AC11
- Notas:
  - `page.tsx` es Server Component: `await searchParams`, `parseSearchParams` y `searchEvents`.
  - Los controles son client y actualizan la URL con `router.replace(..., { scroll: false })`.
  - `EventSearchForm` recibe valores iniciales opcionales y en el submit hace `router.push('/events?…')`.

### T3 — Checkout: schema y store
- Archivos: `src/modules/booking/checkout.schema.ts`, `src/modules/booking/checkout.schema.test.ts`, `src/modules/booking/booking.store.ts`, `src/modules/booking/booking.store.test.ts`, `src/modules/booking/booking.types.ts`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC7, AC8, AC9
- Notas:
  - `checkoutSchema` es un `z.discriminatedUnion` por método, o bien `superRefine` para los datos de tarjeta.
  - Store:
    - `startReservation()` fija `reservationExpiresAt = now + 10 min` si no existe.
    - `confirmOrder(input)` crea el `Order` y limpia `seats`, `quantities` y la reserva.
    - `init` de otro evento también limpia la reserva.
  - El número de pedido se genera en el cliente al confirmar; la función que lo genera es inyectable o testeable.

### T4 — Checkout: página y componentes
- Archivos: `src/app/events/[id]/checkout/page.tsx`, `src/modules/booking/components/{CheckoutForm,PaymentMethodPicker,ReservationTimer,CheckoutSummary}.tsx`, `src/modules/booking/components/CheckoutHeader.tsx`, `src/modules/booking/components/OrderSummary.tsx`
- Depende de: T3
- Paralelizable: sí (con T2 y T5)
- Cubre: AC7, AC8, AC9, AC11
- Notas:
  - Formulario controlado con `useState` más `checkoutSchema.safeParse` al enviar. No se agrega una librería de formularios (YAGNI).
  - Los campos usan `Input`/`Select` de shadcn con `h-[52px]` y `rounded-[14px]` del diseño.

### T5 — Confirmación: página y componentes
- Archivos: `src/app/events/[id]/confirmation/page.tsx`, `src/modules/booking/components/{OrderConfirmation,TicketPass}.tsx`, `src/components/ui/qr-pattern.tsx`
- Depende de: T3
- Paralelizable: sí (con T2 y T4)
- Cubre: AC1, AC10, AC11
- Notas:
  - `QrPattern` es una grilla 21×21 con las tres marcas de esquina y celdas pseudoaleatorias con seed (determinista, sin `Math.random`), `aria-hidden`.
  - La tarjeta sigue el estilo "ticket" de `EventCard`: talón con borde punteado y muescas.

## Preguntas abiertas

- **Persistencia al recargar**: por defecto no se persiste nada, así que recargar el checkout o la confirmación muestra el estado vacío. Alternativa: `persist` de zustand en `sessionStorage` para que la selección y el pedido sobrevivan a un recargo dentro de la pestaña.
- **Búsqueda por fecha**: el buscador del hero elige un día exacto. Por defecto se interpreta como "desde ese día" (`desde=YYYY-MM-DD`) y convive con el filtro "Mes" del lateral.
- **Precio con monedas mezcladas** (PEN, EUR, USD): los rangos comparan el número sin convertir, igual que el diseño.
- **"Ver mis entradas"**: queda visual hasta la fase de "Mis entradas".

## Próximas fases

- Login y registro (`Auth`) y "Mis entradas" (`MyTickets`), que leerían los pedidos.
- Panel de organizador y crear evento (`OrgDashboard`, `OrgCreate`).
