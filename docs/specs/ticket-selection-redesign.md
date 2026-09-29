# Rediseño de la selección de entradas y ajustes de checkout/confirmación

Estado: borrador

## Objetivo

Hoy la pantalla `/events/[id]/tickets` reparte una misma decisión en tres tarjetas: "Elige tu zona" (grilla de botones), "Elige tus asientos" (mapa SVG) y "Entradas" (lista con +/−). Además el mapa de asientos se ve básico. Esta spec la rediseña como **un solo mapa del recinto con zoom a la zona**, que es el patrón de Ticketmaster y SeatGeek:

- Primero ves el estadio completo con las zonas pintadas por precio.
- Al tocar una zona numerada, el mapa hace zoom a esa zona y muestra sus asientos.
- Al tocar una zona de pie, eliges la cantidad en el mismo panel.
- Siempre hay una sola columna de resumen al lado.

Incluye además tres ajustes pedidos:
- Asterisco rojo en los campos obligatorios del checkout.
- El texto "Entrada N de M" ya no se corta en la confirmación.
- "Agregar al calendario" y "Descargar PDF" funcionan.

Sigue `docs/design/design-system.md` sin re-decidirlo. Solo UI con mock data.

## Referencias y decisiones de UX

- **Ticketmaster / SeatGeek**:
  - Mapa del recinto con secciones curvas coloreadas por precio, hover con nombre y precio, y clic para acercar a la sección.
  - En la sección: asientos pequeños por fila, tooltip con fila, asiento y precio, y selección con check.
  - Minimapa con la ubicación actual.
  - Resumen persistente "Tus entradas".
- **Joinnus**: lista de zonas con precio junto al mapa. Aquí sirve como leyenda clicable y como alternativa accesible al mapa.
- Decisiones:
  1. **Un solo panel con dos niveles**: vista "Recinto" y vista "Zona". Se vuelve con "← Todas las zonas" y con un breadcrumb "Estadio › Tribuna Occidente".
  2. **Leyenda de zonas y precios** bajo el mapa (chips) que hace lo mismo que tocar el mapa. Reemplaza la tarjeta "Entradas".
  3. **Zonas de pie**: al elegirlas, el panel muestra la zona resaltada en el mapa y un stepper grande de cantidad ("Campo General · De pie · S/ 450 c/u").
  4. **Asientos con forma de butaca** (rectángulo redondeado con respaldo) en vez de círculos:
     - Disponibles del color de la zona.
     - Seleccionado en índigo oscuro con check.
     - Ocupado en gris claro sin borde.
     - Los estados se distinguen por luminosidad y forma, no solo por color.
  5. **Tooltip al pasar o enfocar un asiento** ("Fila C · Asiento 12 · S/ 380") y resaltado de la fila bajo el cursor. En táctil, el tooltip aparece al tocar un asiento ya seleccionado.
  6. **Minimapa** (`MiniMap` de `react-zoom-pan-pinch`) en la esquina de la vista "Zona", con controles de zoom más pulidos (grupo vertical con sombra).
  7. **Etiqueta "Escenario"** en la vista "Zona", orientada según dónde está la zona, y numeración de filas a ambos lados.

## Alcance

- Incluye:
  - `/events/[id]/tickets`:
    - Rediseño de la columna izquierda en un único panel `VenueExplorer` con vista "Recinto" (SVG del estadio con zonas clicables, hover y precio) y vista "Zona" (asientos o cantidad).
    - Leyenda de zonas clicable.
    - La columna derecha `OrderSummary` se mantiene.
    - Se eliminan `ZoneMap` y `ZoneQuantityList`.
  - Mapa de asientos mejorado:
    - Butacas.
    - Tooltip.
    - Resaltado de fila.
    - Minimapa.
    - Controles de zoom.
    - Zoom animado al entrar a la zona.
    - Teclado: Tab entra al primer asiento disponible y las flechas navegan por fila y asiento ("roving tabindex"). Así no hay cientos de tab stops.
  - Datos: geometría del recinto (paths SVG de cada zona) en `venue-service`.
  - Checkout: asterisco rojo (`*`, `aria-hidden`) en cada campo obligatorio y la nota "Los campos con * son obligatorios". Los inputs llevan `required`/`aria-required`.
  - Confirmación:
    - El pie de la tarjeta de entrada pone el texto "Entrada N de M" en su propia línea, sobre los botones anterior y siguiente, para que no se corte.
    - "Agregar al calendario" descarga un `.ics` del evento.
    - "Descargar PDF" genera un PDF con una página por entrada (evento, fecha, lugar, zona, asiento, pedido y QR decorativo) con `jspdf` cargado bajo demanda.
- No incluye:
  - "Mejores asientos disponibles" (autoselección), filtros por precio en el mapa ni layouts de recinto por evento (todos siguen usando el estadio mock).
  - QR real, envío de correo y cambios al flujo de datos del store.

## Reutilizar

- `booking.store` completo (`toggleSeat`, `setQuantity`, `setActiveZone`, límites, líneas y totales). Sin cambios de API.
- `react-zoom-pan-pinch` (ya instalado): `TransformWrapper`, `useControls`, `MiniMap` y `zoomToElement`.
- `OrderSummary`, `CheckoutHeader`, `QrPattern` (se extrae su generador de celdas para reutilizarlo en el PDF), `formatEventPrice` y `formatEventDateParts`.
- `EventStatusBadge` para "Últimas entradas".

## Archivos

**T0 (base):**
- `package.json`, `package-lock.json` (`npm i jspdf`)

**T1 (datos y lógica pura):**
- `src/modules/booking/booking.types.ts` (modificado — `Zone.shape`: path SVG y punto de etiqueta en la vista "Recinto")
- `src/modules/booking/services/venue-service.ts` (modificado — paths del estadio y viewBox)
- `src/modules/booking/services/venue-service.test.ts` (modificado)
- `src/modules/booking/seat-navigation.ts` (nuevo — siguiente asiento con flechas, saltando ocupados)
- `src/modules/booking/seat-navigation.test.ts` (nuevo)

**T2 (vista Recinto y panel):**
- `src/modules/booking/components/VenueExplorer.tsx` (nuevo — client; alterna Recinto y Zona, breadcrumb, leyenda)
- `src/modules/booking/components/VenueOverview.tsx` (nuevo — SVG del estadio con zonas clicables y hover)
- `src/modules/booking/components/ZoneLegend.tsx` (nuevo — chips de zona con precio y estado)
- `src/modules/booking/components/GeneralAdmissionPanel.tsx` (nuevo — stepper grande para zonas de pie)
- `src/modules/booking/components/TicketSelection.tsx` (modificado — usa `VenueExplorer`)
- `src/modules/booking/components/ZoneMap.tsx`, `ZoneQuantityList.tsx` (eliminados)

**T3 (mapa de asientos):**
- `src/modules/booking/components/SeatMap.tsx` (reescrito — butacas, tooltip, fila resaltada, roving tabindex, minimapa, controles, zoom animado)

**T4 (checkout y confirmación):**
- `src/modules/booking/components/CheckoutForm.tsx` (modificado — asteriscos y `required`)
- `src/modules/booking/components/TicketPass.tsx` (modificado — pie de navegación)
- `src/modules/booking/components/OrderConfirmation.tsx` (modificado — botones funcionales)
- `src/modules/booking/ticket-export.ts` (nuevo — `buildIcs(event)` puro y `downloadTicketsPdf(order, event)` con import dinámico de `jspdf`)
- `src/modules/booking/ticket-export.test.ts` (nuevo — `buildIcs`)
- `src/components/ui/qr-pattern.tsx` (modificado — exporta `buildQrCells`)

## Criterios de aceptación

- AC1: `npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan. Sin errores de consola ni de hidratación en `/events/evt-001/tickets`.
- AC2: La pantalla de entradas tiene **un solo panel** a la izquierda.
  - Vista "Recinto": escenario, campo (VIP y General) y las tres tribunas como formas curvas, cada una con su color y precio (o "Agotado" con trama).
  - Hover o foco en una zona la resalta y muestra nombre y precio.
  - Cada zona es operable con teclado (`role="button"` o `<a>`/`<button>` equivalente, con `aria-label` "Tribuna Oriente, S/ 320").
- AC3: Bajo el mapa, la leyenda lista todas las zonas con color, precio y estado. Tocar una zona en el mapa o en la leyenda abre la vista "Zona". No existe más la tarjeta separada "Entradas".
- AC4: Vista "Zona" numerada:
  - Breadcrumb "Estadio › <Zona>" y botón "← Todas las zonas".
  - Asientos con forma de butaca, filas etiquetadas a ambos lados y "Escenario" indicado.
  - Zoom animado de entrada, minimapa y controles acercar/alejar/restablecer de al menos 44px.
- AC5: Tooltip al pasar el mouse o enfocar un asiento con fila, asiento y precio, y resaltado de su fila. Los ocupados muestran "Ocupado".
- AC6: Teclado en el mapa de asientos:
  - Un solo tab stop en el mapa.
  - Las flechas mueven entre asientos (← → en la fila, ↑ ↓ entre filas), saltando los ocupados.
  - Enter o Espacio selecciona.
  - `aria-label` por asiento y `aria-checked`.
- AC7: Vista "Zona" de pie: la zona queda resaltada en el mapa y se muestra un stepper grande con precio por entrada y subtotal. Se respeta el máximo de 6.
- AC8: En móvil (390px) el panel ocupa el ancho sin scroll horizontal, el mapa admite pinch y arrastre, y la barra inferior de total y "Continuar" sigue fija.
- AC9: En el checkout, cada campo obligatorio (nombre, correo, documento, celular y los de tarjeta cuando aplica) muestra un `*` rojo en su label, y el input tiene `aria-required="true"`. Hay una nota "Los campos con * son obligatorios".
- AC10: En la confirmación con 2 o más entradas, "Entrada N de M" se ve completo en escritorio y móvil, con los botones anterior y siguiente debajo.
- AC11: "Agregar al calendario" descarga `<titulo-del-evento>.ics` válido (VCALENDAR/VEVENT con DTSTART y DTEND en hora local, SUMMARY, LOCATION y DESCRIPTION con el pedido). "Descargar PDF" descarga `entradas-<pedido>.pdf` con una página por entrada.

## Tests requeridos

- `venue-service.test.ts`: cada zona trae `shape` con path y punto de etiqueta; lo que ya se testea sigue verde.
- `seat-navigation.test.ts`: derecha e izquierda dentro de la fila, saltar ocupados, arriba y abajo al asiento más cercano de la fila vecina, y bordes sin salida.
- `ticket-export.test.ts`: `buildIcs` incluye los campos requeridos, escapa comas y punto y coma, y usa CRLF.
- Sin tests de componentes visuales (SETUP.md).

## Tareas

### T0 — Dependencia de PDF
- Archivos: `package.json`, `package-lock.json`
- Depende de: —
- Paralelizable: sí
- Cubre: AC11

### T1 — Geometría del recinto y navegación por teclado
- Archivos: `booking.types.ts`, `services/venue-service.ts`, `services/venue-service.test.ts`, `seat-navigation.ts`, `seat-navigation.test.ts`
- Depende de: —
- Paralelizable: sí
- Cubre: AC2, AC6

### T2 — Panel de recinto, leyenda y zonas de pie
- Archivos: `VenueExplorer.tsx`, `VenueOverview.tsx`, `ZoneLegend.tsx`, `GeneralAdmissionPanel.tsx`, `TicketSelection.tsx`, y se eliminan `ZoneMap.tsx` y `ZoneQuantityList.tsx`
- Depende de: T1
- Paralelizable: sí (con T3 y T4)
- Cubre: AC2, AC3, AC7, AC8

### T3 — Mapa de asientos mejorado
- Archivos: `SeatMap.tsx`
- Depende de: T1
- Paralelizable: sí (con T2 y T4)
- Cubre: AC4, AC5, AC6, AC8

### T4 — Checkout y confirmación
- Archivos: `CheckoutForm.tsx`, `TicketPass.tsx`, `OrderConfirmation.tsx`, `ticket-export.ts`, `ticket-export.test.ts`, `src/components/ui/qr-pattern.tsx`
- Depende de: T0
- Paralelizable: sí (con T2 y T3)
- Cubre: AC9, AC10, AC11

## Preguntas abiertas

- **PDF**: se usa `jspdf` (~300 kB, cargado solo al hacer clic). Alternativa sin dependencia: abrir el diálogo de impresión del navegador con una hoja de estilos de impresión, pero no descarga un archivo directamente.
- **Hora de fin en el `.ics`**: se asume una duración de 3 h desde `startsAt`, porque el mock no tiene hora de término.

## Próximas fases

- "Mejores asientos disponibles" (autoselección contigua) y filtro por rango de precio en el mapa.
- Login y "Mis entradas", y panel de organizador.
