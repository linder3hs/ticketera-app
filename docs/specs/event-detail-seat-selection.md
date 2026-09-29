# Detalle de evento y selección de entradas con mapa de asientos (mock data)

Estado: aprobada

## Objetivo

Construir, solo UI/UX y con mock data, las pantallas 3 y 4 del diseño de Claude Design ("Ticketera Landing Redesign", artboards `EventDetail`, `EventDetailMobile`, `Tickets`, `TicketsMobile`): el detalle de un evento y la selección de entradas, en escritorio y móvil. Sobre el mapa de zonas del diseño se agrega un **mapa de asientos seleccionable** para las zonas numeradas (tribunas).

Es la fase 1 del flujo de compra (búsqueda → detalle → entradas → pago → confirmación). Sigue `docs/design/design-system.md` (paleta, Poppins, radios, `cta` naranja) sin re-decidirlo.

## Decisión: librería para el mapa de asientos

Evaluadas contra el stack (React 19.2.8, Next 16 App Router, Tailwind v4, sin backend):

| Opción | Veredicto |
|---|---|
| **SVG propio en React + `react-zoom-pan-pinch` (v4.2)** | **Elegida.** SVG escala nítido, se estiliza con tokens CSS, cada asiento es un nodo del DOM (foco, `aria-*`, teclado). `react-zoom-pan-pinch` añade zoom con rueda, arrastre y pinch en móvil sobre cualquier nodo; peer `react: *`, mantenida (sep 2026), ~10 kB. Cientos/miles de asientos por zona son manejables en SVG. |
| `react-konva` + `konva` (canvas) | Descartada: su peer exige `react ^19.3.0` (tenemos 19.2.8), canvas no es accesible (sin foco ni lector de pantalla) y no renderiza en SSR. Solo compensa con decenas de miles de asientos. |
| `@seatsio/seatsio-react` | Descartada: SaaS comercial; los mapas viven en su plataforma y requieren cuenta/clave. Opción a evaluar solo si más adelante se quiere un editor de venues gestionado. |
| `react-seat-picker`, `seatchart` | Descartadas: sin soporte React 19 (peer React 15/16) o abandonadas desde 2022, solo grillas rectangulares. |

## Alcance

- Incluye:
  - Ruta `/events/[id]` — detalle del evento: hero (imagen, categoría, título, fecha, hora, lugar), "Acerca del evento", "Información importante" (apertura de puertas, inicio, edad mínima, ingreso con QR), lista de entradas por zona con estado, tarjeta "Lugar" (mapa como placeholder visual), "También te puede interesar" y tarjeta de compra (sticky en escritorio, barra fija inferior en móvil). Botón guardar (toggle visual local) y compartir (visual).
  - Ruta `/events/[id]/tickets` — selección de entradas: header de compra con pasos (1 Entradas · 2 Datos y pago · 3 Confirmación; barra de progreso en móvil), resumen del evento, **mapa de zonas** (escenario + zonas clicables como en el diseño), **mapa de asientos** para zonas numeradas, selector de cantidad (+/−) para zonas de campo (sin numerar), resumen "Tu compra" (aside en escritorio, barra fija inferior en móvil) con total y botón "Continuar".
  - Mapa de asientos: SVG con filas y asientos, estados disponible / ocupado / seleccionado, leyenda, zoom y paneo (rueda + arrastre en escritorio, pinch + arrastre en móvil) con botones acercar/alejar/restablecer, selección por click/tap y por teclado (Tab + Enter/Espacio), máximo de entradas por zona.
  - Mock data: detalle de evento, zonas con precio/color/estado/tipo (`general` | `seated`) y asientos generados de forma **determinista** (misma salida en servidor y cliente, sin `Math.random`).
  - Estado de la selección en un store `zustand` (será la entrada del checkout en la fase 2).
  - Enlaces: las cards de evento de la landing (`EventCard`) navegan a `/events/[id]`; "Comprar entradas" navega a `/events/[id]/tickets`.
  - Instalar `react-zoom-pan-pinch`.
- No incluye:
  - Checkout, confirmación, búsqueda, login, "Mis entradas" y panel de organizador (próximas fases).
  - Persistencia real, bloqueo/reserva de asientos, temporizador de reserva, precios dinámicos.
  - Mapa geográfico real en "Lugar" (queda como placeholder, igual que el diseño).
  - Editor de venues / mapas por evento distintos: todos los eventos usan el mismo layout de estadio mock.
  - Dark mode.

## Reutilizar

- `src/modules/event/event.types.ts` (`Event`) y `services/event-service.ts` (mock `EVENTS`): se extienden, no se duplican.
- `src/modules/event/event.utils.ts`: `formatEventPrice`, `formatEventDateParts` para precios y fechas.
- `src/modules/event/components/EventCard.tsx` para "También te puede interesar" (no crear otra card).
- `src/modules/event/components/EventStatusBadge.tsx` para badges de estado ("Últimas", "Agotado") si su API lo permite; si no, extenderlo.
- `src/components/SiteHeader.tsx` / `Navbar.tsx` / `Footer.tsx` en el detalle de evento.
- `src/components/Logo.tsx` en el header de compra.
- shadcn ya instalados: `button` (variante `cta`), `card`, `badge`, `separator`, `sheet`.
- `lucide-react` para iconos; `cn()` de `src/lib/utils.ts`.

## Archivos

**T0 (base, compartido):**
- `package.json`, `package-lock.json` (modificados — `npm i react-zoom-pan-pinch`)

**T1 (datos mock):**
- `src/modules/event/event.types.ts` (modificado)
- `src/modules/event/services/event-service.ts` (modificado)
- `src/modules/event/services/event-service.test.ts` (modificado)
- `src/modules/booking/booking.types.ts` (nuevo)
- `src/modules/booking/services/venue-service.ts` (nuevo)
- `src/modules/booking/services/venue-service.test.ts` (nuevo)

**T2 (lógica de selección):**
- `src/modules/booking/booking.store.ts` (nuevo)
- `src/modules/booking/booking.store.test.ts` (nuevo)

**T3 (detalle de evento):**
- `src/app/events/[id]/page.tsx` (nuevo)
- `src/modules/event/components/EventDetailHero.tsx` (nuevo)
- `src/modules/event/components/EventInfoGrid.tsx` (nuevo)
- `src/modules/event/components/TicketTierList.tsx` (nuevo)
- `src/modules/event/components/VenueCard.tsx` (nuevo)
- `src/modules/event/components/PurchaseCard.tsx` (nuevo — tarjeta sticky en escritorio + barra fija en móvil)
- `src/modules/event/components/SaveEventButton.tsx` (nuevo — client, toggle local)
- `src/modules/event/components/EventCard.tsx` (modificado — enlace a `/events/[id]`)

**T4 (selección de entradas):**
- `src/app/events/[id]/tickets/page.tsx` (nuevo)
- `src/modules/booking/components/CheckoutHeader.tsx` (nuevo — logo, pasos, "Compra segura"; barra de progreso en móvil)
- `src/modules/booking/components/ZoneMap.tsx` (nuevo)
- `src/modules/booking/components/SeatMap.tsx` (nuevo)
- `src/modules/booking/components/ZoneQuantityList.tsx` (nuevo)
- `src/modules/booking/components/OrderSummary.tsx` (nuevo — aside en escritorio + barra fija en móvil)
- `src/modules/booking/components/TicketSelection.tsx` (nuevo — client, compone mapa + lista + resumen)

## Criterios de aceptación

- AC1: `npm run build` y `npm run lint` pasan; `/events/evt-001` y `/events/evt-001/tickets` renderizan; un id inexistente devuelve la página 404 (`notFound()`).
- AC2: El detalle muestra, en este orden, hero → Acerca → Información importante → Entradas → Lugar → Relacionados, y la tarjeta de compra con "Desde <precio>" y "Comprar entradas" (`variant="cta"`) que navega a `/events/[id]/tickets`. En ≥1024px la tarjeta es sticky en una columna lateral; en <1024px es una barra fija inferior que no tapa contenido (padding inferior en la página).
- AC3: Las cards de evento de la landing navegan a `/events/[id]` con `next/link`.
- AC4: En `/events/[id]/tickets` el mapa de zonas muestra el escenario y las 5 zonas del diseño (Campo VIP, Campo General, Tribuna Occidente, Oriente, Norte) como `<button>` con `aria-pressed`, color por zona y precio o "Agotado". Una zona agotada no se puede seleccionar para comprar.
- AC5: Al elegir una zona `seated`, aparece su mapa de asientos SVG: filas etiquetadas, asientos disponibles/ocupados/seleccionados distinguibles por **luminosidad y forma**, no solo por color (ocupado = gris con aspa o relleno tenue), y una leyenda.
- AC6: Click/tap en un asiento disponible lo selecciona; otro click lo deselecciona; los ocupados no reaccionan. Con teclado, cada asiento es enfocable (`role="checkbox"`, `aria-checked`, `aria-label` "Fila C, asiento 12, S/ 380"; ocupados con `aria-disabled`) y Enter/Espacio alterna la selección.
- AC7: El mapa de asientos permite zoom y paneo con rueda/arrastre (escritorio) y pinch/arrastre (móvil) vía `react-zoom-pan-pinch`, y tiene botones "Acercar", "Alejar" y "Restablecer" con `aria-label` y ≥44px de área táctil.
- AC8: Al elegir una zona `general` (campo), se usa el selector +/− de la lista de entradas; − deshabilitado en 0 y + deshabilitado al llegar al máximo.
- AC9: Máximo 6 entradas por zona (asientos o cantidad); al alcanzarlo, los asientos disponibles restantes de esa zona no se pueden seleccionar y se muestra el aviso "Máximo 6 entradas por zona".
- AC10: El resumen "Tu compra" lista cada zona (cantidad × zona, y para numeradas un chip por asiento, p. ej. "A4"), el total en `S/` con `formatEventPrice`, y "Continuar" (`variant="cta"`) habilitado solo con ≥1 entrada. Vacío: mensaje "Todavía no elegiste entradas…" y botón deshabilitado. Cada asiento se puede quitar desde el resumen.
- AC11: El layout de asientos es determinista: recargar muestra los mismos asientos ocupados y no hay error de hidratación en consola.
- AC12: Accesibilidad y responsive: sin scroll horizontal de página entre 375px y 1440px (el mapa hace zoom dentro de su contenedor), `focus-visible` visible en todo control, botones solo-icono con `aria-label`, contraste de texto ≥4.5:1.

## Tests requeridos

- `src/modules/event/services/event-service.test.ts`: `getEventById` devuelve el evento con sus campos de detalle y `undefined` con id inexistente; `getRelatedEvents` excluye el evento actual.
- `src/modules/booking/services/venue-service.test.ts`: `getVenueMap(eventId)` devuelve las 5 zonas; las `seated` traen filas y asientos; dos llamadas devuelven asientos ocupados idénticos (determinismo); ids de asiento únicos.
- `src/modules/booking/booking.store.test.ts`: seleccionar/deseleccionar asiento, no permite asiento ocupado, respeta el máximo por zona, incrementa/decrementa cantidad general con límites 0..máx, total y conteo correctos, `reset` al cambiar de evento.
- No se requieren tests de componentes visuales (SETUP.md los exime).

## Tareas

### T0 — Dependencia del mapa de asientos
- Archivos: `package.json`, `package-lock.json`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC7
- Notas: `npm i react-zoom-pan-pinch`. Nada más.

### T1 — Datos mock: detalle de evento y venue
- Archivos: `src/modules/event/event.types.ts`, `src/modules/event/services/event-service.ts`, `src/modules/event/services/event-service.test.ts`, `src/modules/booking/booking.types.ts`, `src/modules/booking/services/venue-service.ts`, `src/modules/booking/services/venue-service.test.ts`
- Depende de: —
- Paralelizable: sí (con T0)
- Cubre: AC1, AC4, AC5, AC11
- Notas:
  - `event.types.ts`: `interface EventDetail extends Event { description: string; doorsOpenAt: string; startsAt: string; minAge: number | null; address: string }` (horas "HH:mm"). Los datos que el diseño deja como `[PLACEHOLDER]` se completan con valores mock plausibles.
  - `event-service.ts`: `getEventById(id): Promise<EventDetail | undefined>` y `getRelatedEvents(id, limit = 4): Promise<Event[]>` (misma categoría primero, luego el resto, excluye el actual). Agregar los campos de detalle a los eventos existentes sin romper las funciones actuales.
  - `booking.types.ts`: `ZoneKind = "general" | "seated"`, `ZoneStatus = "available" | "last-tickets" | "sold-out"`, `interface Zone { id; name; shortName; price; currency; color; status; kind; rows?: SeatRow[] }`, `interface SeatRow { label: string; seats: Seat[] }`, `interface Seat { id: string; row: string; number: number; x: number; y: number; status: "available" | "occupied" }`, `interface VenueMap { eventId; zones: Zone[] }`.
  - `venue-service.ts`: `getVenueMap(eventId): Promise<VenueMap>` con las 5 zonas y colores/precios del diseño (VIP S/690 agotado · General S/450 · Occidente S/380 últimas · Oriente S/320 · Norte S/250). Campo VIP y General `general`; las 3 tribunas `seated` (p. ej. 10–12 filas × 18–24 asientos; tribunas laterales con leve curva vía `x`,`y`). Ocupación con un pseudoaleatorio con semilla (hash de `eventId` + id de asiento), ~35% ocupado; "últimas" ~85%. Exponer las funciones puras de generación solo si los tests las necesitan.

### T2 — Store de la selección
- Archivos: `src/modules/booking/booking.store.ts`, `src/modules/booking/booking.store.test.ts`
- Depende de: T1
- Paralelizable: no (T4 depende de él; puede correr en paralelo con T3)
- Cubre: AC6, AC8, AC9, AC10
- Notas: `useBookingStore = create(...)` con `eventId`, `activeZoneId`, `seatIds` por zona, `quantities` por zona `general`. Acciones: `init(eventId)` (resetea si cambia de evento), `setActiveZone`, `toggleSeat(zone, seat)`, `setQuantity(zoneId, n)`, `removeSeat`, `reset`. `MAX_TICKETS_PER_ZONE = 6`. Selectores/funciones puras para líneas del resumen, conteo y total (testeables sin React). Sin persistencia.

### T3 — Página de detalle de evento
- Archivos: `src/app/events/[id]/page.tsx`, `src/modules/event/components/{EventDetailHero,EventInfoGrid,TicketTierList,VenueCard,PurchaseCard,SaveEventButton}.tsx`, `src/modules/event/components/EventCard.tsx`
- Depende de: T1
- Paralelizable: sí (con T2)
- Cubre: AC1, AC2, AC3, AC12
- Notas: leer `node_modules/next/dist/docs/` para `params` asíncronos, `generateMetadata` y `notFound` en Next 16. Server Component; solo `SaveEventButton` es client. `TicketTierList` recibe las zonas de `getVenueMap` (misma fuente que la pantalla de entradas). Layout escritorio: hero ancho + dos columnas (contenido | `PurchaseCard` sticky); móvil según `EventDetailMobile`. Relacionados con `EventCard` en fila con scroll horizontal (móvil) / grid (escritorio).

### T4 — Pantalla de selección de entradas y mapa de asientos
- Archivos: `src/app/events/[id]/tickets/page.tsx`, `src/modules/booking/components/{CheckoutHeader,ZoneMap,SeatMap,ZoneQuantityList,OrderSummary,TicketSelection}.tsx`
- Depende de: T0, T1, T2
- Paralelizable: no
- Cubre: AC4–AC12
- Notas:
  - `page.tsx` (Server): obtiene evento + venue y renderiza `CheckoutHeader` + `TicketSelection` (client) con los datos como props.
  - `ZoneMap`: grilla CSS del diseño (escenario arriba, VIP y General al centro, Occidente/Oriente a los lados, Norte abajo), cada zona `<button aria-pressed>`.
  - `SeatMap`: `<TransformWrapper>/<TransformComponent>` de `react-zoom-pan-pinch` envolviendo un `<svg viewBox>` con un `<g>` por fila (etiqueta de fila) y un nodo por asiento (`role="checkbox"`, `tabIndex`, `onKeyDown` Enter/Espacio). Controles de zoom con `useControls`. Contenedor de alto fijo (p. ej. 360px móvil / 440px escritorio), `touch-action` gestionado por la librería. Evitar que un arrastre dispare selección (usar `onClick` normal; la librería ya distingue paneo).
  - `ZoneQuantityList`: lista de zonas con estado; zonas `general` con stepper +/−; zonas `seated` muestran "Elige en el mapa" y el conteo.
  - `OrderSummary`: aside sticky ≥1024px; barra inferior fija en móvil con total + "Continuar". "Continuar" es visual en esta fase (ver preguntas abiertas).

## Preguntas abiertas

- **"Continuar" sin checkout**: por defecto queda como botón visual (sin navegación) hasta la fase 2. Alternativa: enlazar ya a `/events/[id]/checkout` aunque dé 404.
- **Zonas numeradas**: se asume que solo las tribunas tienen asientos y Campo VIP/General son de pie (cantidad). Si se quiere asiento numerado también en campo, se agrega como zona `seated`.
- **Rutas en inglés** (`/events/[id]/tickets`) por la regla de naming de SETUP.md, aunque la UI está en español y la landing usa `?categoria=`. Si se prefieren URLs en español (`/eventos/[id]/entradas`), indicarlo antes de aprobar.
- **Mismo estadio para todos los eventos**: los eventos de teatro/familiar mostrarán el layout de estadio mock. Un layout de teatro se deja para una fase posterior.

## Próximas fases

- Fase 2: Checkout y pago (`Checkout`/`CheckoutMobile`) con temporizador de reserva, y Confirmación con entrada QR (`Confirmation`/`ConfirmationMobile`), leyendo del `booking.store`.
- Fase 3: Búsqueda y listado con filtros (`Search`/`SearchMobile`).
- Fase 4: Login/registro (`Auth`) y "Mis entradas" (`MyTickets`).
- Fase 5: Panel de organizador y crear evento (`OrgDashboard`, `OrgCreate`).
