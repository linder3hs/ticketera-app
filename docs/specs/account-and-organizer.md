# Login/registro, Mis entradas, panel de organizador y crear evento (mock data)

Estado: aprobada

## Objetivo

Construir, solo UI/UX con mock data, las pantallas 7 y 8 del diseño de Claude Design ("Ticketera Landing Redesign") en escritorio y móvil:

- **Login y registro** (`Auth`, `AuthMobile`).
- **Mis entradas** (`MyTickets`, `MyTicketsMobile`).
- **Panel de organizador** (`OrgDashboard`, `OrgDashboardMobile`).
- **Crear evento** (`OrgCreate`, `OrgCreateMobile`).

Con esto se completan todas las vistas del diseño. Sigue `docs/design/design-system.md` sin re-decidirlo.

## Alcance

- Incluye:
  - **`/login` y `/register`** (una sola pantalla con pestañas enlazadas a cada ruta):
    - En escritorio, panel de marca a la izquierda (foto, "Tus entradas, siempre a mano."); en móvil, cabecera compacta con la foto.
    - Formulario de login: correo, contraseña con mostrar/ocultar y "¿Olvidaste tu contraseña?" (visual).
    - Formulario de registro: nombre, correo, contraseña con mostrar/ocultar y términos.
    - Validación con `zod`, errores por campo y asteriscos rojos en los campos obligatorios (igual que el checkout).
    - Sesión simulada: cualquier correo y contraseña válidos inician sesión y redirigen a `/my-tickets` (o a `?next=`).
    - **"Continuar con Google"** en ambas pestañas, arriba del formulario, con el logo oficial de Google (SVG inline) y un separador "o con tu correo". Sigue las pautas de marca de Google: botón blanco con borde, logo a la izquierda y texto "Continuar con Google". Es **simulado**: al hacer clic muestra un estado de carga breve e inicia sesión con una cuenta mock (`Ana Pérez · ana.perez@gmail.com`, `provider: "google"`) y la misma redirección.
  - **Navbar con sesión**:
    - Sin sesión: "Iniciar sesión" lleva a `/login` y "Vender entradas" a `/organizer`.
    - Con sesión: "Mis entradas" (link activo) y un botón de cuenta con menú (nombre, correo, "Panel de organizador", "Cerrar sesión").
  - **`/my-tickets`**:
    - Pestañas "Próximas (N)" y "Pasadas (N)".
    - En escritorio, la lista de pedidos a la izquierda y la entrada seleccionada a la derecha. La tarjeta lleva foto con fecha, datos del evento, talón perforado, QR decorativo grande, "Entrada N de M" con anterior y siguiente, zona, asiento, titular, código y estado "Válida", y botones "Descargar PDF" y "Agregar al calendario" (reutilizan `ticket-export`).
    - En móvil, la lista arriba y la tarjeta debajo.
    - Muestra dos pedidos mock y los pedidos comprados en la sesión.
    - Estado vacío de "Pasadas" con "Explorar eventos".
    - Sin sesión: aviso "Inicia sesión para ver tus entradas" con link a `/login?next=/my-tickets`.
  - **Confirmación de compra**: "Ver mis entradas" pasa a ser un link a `/my-tickets`.
  - **`/organizer`**:
    - En escritorio, sidebar ("Resumen" activo; "Mis eventos", "Ventas" y "Configuración" visuales; organizador y "Cerrar sesión" abajo). En móvil, header con menú en `Sheet`.
    - KPIs: entradas vendidas, ingresos y eventos publicados.
    - "Crear evento".
    - Lista de eventos con filtro "Todos", "Publicados" o "Borradores". Cada evento muestra imagen, fecha, ciudad, estado, barra de vendidas sobre capacidad, ingresos y la acción ("Ver ventas" visual o "Editar"). En escritorio es tabla; en móvil, tarjetas.
  - **`/organizer/events/new`**:
    - Secciones:
      - Información básica: nombre, categoría y descripción.
      - Fecha y lugar: fecha, hora, lugar y ciudad.
      - Imagen de portada: arrastrar o elegir archivo, con vista previa local y botón para quitarla.
      - Tipos de entrada: nombre, precio y cantidad, con agregar y quitar (mínimo 1) y la capacidad total.
    - Vista previa en vivo de la card tal como la verán los compradores (sticky en escritorio; bloque previo a las acciones en móvil).
    - "Guardar borrador" pide solo el nombre. "Publicar evento" pide todo.
    - Al guardar, el evento se agrega al panel y se vuelve a `/organizer` con un aviso ("Evento publicado" o "Borrador guardado").
    - Asteriscos rojos en los campos obligatorios para publicar.
- No incluye:
  - Autenticación real: ni OAuth de Google (requiere Client ID, pantalla de consentimiento y backend o Auth.js), ni recuperación de contraseña, ni permisos por rol. El panel no se bloquea sin sesión.
  - Subida real de imágenes (la vista previa usa `URL.createObjectURL`) ni publicación en el catálogo público: los eventos creados viven solo en el panel.
  - Pantallas "Mis eventos", "Ventas", "Configuración" y "Ver ventas" (links visuales).
  - Sincronización entre pestañas o dispositivos: la persistencia es local al navegador.

## Persistencia (decisión del humano al aprobar)

- Los stores `auth`, `booking` (selección, reserva, último pedido y `orders`) y `organizer` (eventos creados) se guardan en `localStorage` con `persist` de zustand (`skipHydration: true`).
- `src/lib/use-persist-hydration.ts` rehidrata el store en el cliente después de montar y devuelve `hydrated`. Así el primer render coincide con el del servidor (sin errores de hidratación).
- Hasta rehidratar, los componentes que leen estos stores muestran un estado de carga y no escriben en el store.
- Efecto colateral: la selección de entradas, la reserva y la confirmación también sobreviven a un recargo de página.

## Reutilizar

- `EventCard`: la vista previa de crear evento usa la misma card, con una prop `preview` sin link y con `unoptimized` para la imagen local.
- `QrPattern`, `ticket-export` (`getOrderTickets`, `downloadIcs`, `downloadTicketsPdf`), `formatEventPrice` y `formatEventDateParts`.
- `getEventById` y `getCategories` del módulo `event`.
- `booking.store`: `confirmOrder` también agrega el pedido a una lista `orders` para "Mis entradas".
- El patrón de `Field` con asterisco y errores del checkout, extraído a `src/components/ui/form-field.tsx` y reutilizado en checkout, auth y crear evento.
- shadcn: `button`, `input`, `select`, `sheet`, `popover`, `badge`.

## Archivos

**T0 (persistencia):**
- `src/lib/use-persist-hydration.ts` (nuevo)
- `src/modules/booking/booking.store.ts` (modificado — `persist`)
- `src/modules/booking/components/{TicketSelection,CheckoutForm,OrderConfirmation}.tsx` (modificados — esperan la rehidratación)

**T1 (auth):**
- `src/components/ui/form-field.tsx` (nuevo — label con `*`, error y `aria-describedby`)
- `src/modules/booking/components/CheckoutForm.tsx` (modificado — usa `FormField`)
- `src/modules/auth/auth.schema.ts`, `auth.schema.test.ts` (nuevos)
- `src/modules/auth/auth.store.ts`, `auth.store.test.ts` (nuevos — `user` con `provider: "email" | "google"`, `login`, `register`, `loginWithGoogle`, `logout`)
- `src/modules/auth/components/AuthScreen.tsx` (nuevo — panel de marca, pestañas y formularios)
- `src/modules/auth/components/PasswordInput.tsx` (nuevo)
- `src/modules/auth/components/GoogleSignInButton.tsx` (nuevo — botón con logo, estado de carga y `aria-busy`)
- `src/modules/auth/components/AccountMenu.tsx` (nuevo)
- `src/app/login/page.tsx`, `src/app/register/page.tsx` (nuevos)
- `src/components/Navbar.tsx` (modificado — estado de sesión)

**T2 (mis entradas):**
- `src/modules/booking/booking.store.ts`, `booking.store.test.ts` (modificados — `orders`)
- `src/modules/booking/services/order-service.ts`, `order-service.test.ts` (nuevos — pedidos mock y `splitOrdersByDate`)
- `src/modules/booking/components/MyTickets.tsx` (nuevo — client)
- `src/modules/booking/components/TicketDetailCard.tsx` (nuevo)
- `src/modules/booking/components/OrderConfirmation.tsx` (modificado — link a `/my-tickets`)
- `src/app/my-tickets/page.tsx` (nuevo)

**T3 (organizador — datos):**
- `src/modules/organizer/organizer.types.ts` (nuevo)
- `src/modules/organizer/services/organizer-service.ts`, `organizer-service.test.ts` (nuevos — eventos mock del organizador y `getOrganizerKpis`)
- `src/modules/organizer/create-event.schema.ts`, `create-event.schema.test.ts` (nuevos — borrador vs publicar)
- `src/modules/organizer/organizer.store.ts`, `organizer.store.test.ts` (nuevos — eventos creados en la sesión y aviso)

**T4 (panel):**
- `src/modules/organizer/components/OrganizerShell.tsx` (nuevo — sidebar y header móvil con `Sheet`)
- `src/modules/organizer/components/OrganizerDashboard.tsx` (nuevo — client: KPIs, filtro y lista)
- `src/modules/organizer/components/OrganizerEventRow.tsx` (nuevo — fila de tabla o tarjeta móvil)
- `src/app/organizer/page.tsx` (nuevo)

**T5 (crear evento):**
- `src/modules/organizer/components/CreateEventForm.tsx` (nuevo — client)
- `src/modules/organizer/components/TicketTypesEditor.tsx` (nuevo)
- `src/modules/organizer/components/CoverImageInput.tsx` (nuevo — dropzone con vista previa)
- `src/modules/event/components/EventCard.tsx` (modificado — prop `preview`)
- `src/app/organizer/events/new/page.tsx` (nuevo)

## Criterios de aceptación

- AC1: `npx tsc --noEmit`, `npm run lint` y `npx vitest run` pasan. `/login`, `/register`, `/my-tickets`, `/organizer` y `/organizer/events/new` renderizan sin errores de consola ni scroll horizontal entre 375px y 1440px.
- AC2: Las pestañas de auth son links a `/login` y `/register`, con `aria-current`. Mostrar/ocultar contraseña es un botón con `aria-label` y `aria-pressed`. Enviar con errores marca cada campo (`aria-invalid` y mensaje) y enfoca el primero. Con datos válidos, la sesión inicia y navega a `?next=` o a `/my-tickets`.
- AC2b: "Continuar con Google" aparece en `/login` y `/register` antes del formulario, con el separador "o con tu correo". Al hacer clic se deshabilita con "Conectando…" (`aria-busy`), inicia la sesión mock con `provider: "google"` y redirige igual que el login por correo. El menú de cuenta muestra "Conectado con Google".
- AC3: El Navbar refleja la sesión: sin sesión muestra "Iniciar sesión"; con sesión muestra "Mis entradas" y el menú de cuenta, con "Cerrar sesión" que vuelve al estado anónimo. También funciona en el menú móvil.
- AC4: `/my-tickets` con sesión lista los pedidos mock y los comprados en la sesión en "Próximas", ordenados por fecha. Seleccionar un pedido muestra su tarjeta y anterior/siguiente recorre sus entradas. "Descargar PDF" y "Agregar al calendario" descargan los archivos. "Pasadas (0)" muestra el estado vacío.
- AC5: Sin sesión, `/my-tickets` muestra el aviso con link a `/login?next=/my-tickets`.
- AC6: `/organizer` muestra los KPIs calculados de los eventos (vendidas, ingresos = vendidas × precio desde, publicados) y los filtros "Todos", "Publicados" y "Borradores" como botones `aria-pressed`. La barra de progreso tiene texto equivalente ("312 / 420 vendidas"). Los borradores muestran "—" en ingresos y la acción "Editar".
- AC7: En `/organizer/events/new`, la vista previa se actualiza al escribir nombre, categoría, fecha, lugar, ciudad, precio más bajo e imagen. La capacidad total suma las cantidades. No se puede quitar el último tipo de entrada.
- AC8: "Guardar borrador" sin nombre muestra el error del nombre. "Publicar evento" valida todos los campos obligatorios (nombre, categoría, fecha, hora, lugar, ciudad y al menos un tipo con nombre, precio ≥ 0 y cantidad ≥ 1). Si todo es válido, el evento aparece en `/organizer` con su estado y se muestra el aviso.
- AC9: La imagen de portada acepta arrastrar y soltar o clic, solo JPG/PNG, con vista previa y botón "Quitar imagen". El dropzone es operable con teclado.

## Tests requeridos

- `auth.schema.test.ts`: login y registro válidos; correo inválido, contraseña de menos de 8 caracteres, nombre vacío y términos sin aceptar.
- `auth.store.test.ts`: `login` y `register` guardan el usuario con `provider: "email"` (el nombre del login sale del correo); `loginWithGoogle` guarda la cuenta mock con `provider: "google"`; `logout` lo limpia.
- `order-service.test.ts`: los pedidos mock referencian eventos existentes; `splitOrdersByDate` separa próximas y pasadas según la fecha de hoy inyectada y ordena por fecha.
- `booking.store.test.ts`: `confirmOrder` agrega el pedido a `orders`.
- `organizer-service.test.ts`: `getOrganizerKpis` suma vendidas, ingresos y publicados, ignorando los borradores en ingresos.
- `create-event.schema.test.ts`: el borrador solo pide nombre; publicar exige todo; valida tipos de entrada.
- `organizer.store.test.ts`: `saveEvent` agrega el evento y fija el aviso; `clearNotice` lo quita.

## Tareas

### T1 — Autenticación simulada y Navbar con sesión
- Archivos: los listados en T1
- Depende de: —
- Paralelizable: sí
- Cubre: AC1, AC2, AC3

### T2 — Mis entradas
- Archivos: los listados en T2
- Depende de: T1 (lee la sesión)
- Paralelizable: sí (con T3)
- Cubre: AC1, AC4, AC5

### T3 — Organizador: datos, schema y store
- Archivos: los listados en T3
- Depende de: —
- Paralelizable: sí
- Cubre: AC6, AC8

### T4 — Panel de organizador
- Archivos: los listados en T4
- Depende de: T3
- Paralelizable: sí (con T5)
- Cubre: AC1, AC6

### T5 — Crear evento
- Archivos: los listados en T5
- Depende de: T1 (`FormField`) y T3
- Paralelizable: sí (con T4)
- Cubre: AC1, AC7, AC8, AC9

## Preguntas abiertas

- **Google real en una fase posterior**: la integración recomendada es Auth.js (`next-auth`) con el provider de Google. Requiere un Client ID y un secreto de Google Cloud y un backend de sesiones. El botón y el store ya quedan con la forma que usaría (`provider: "google"`).
- **Rutas en inglés** (`/login`, `/register`, `/my-tickets`, `/organizer`, `/organizer/events/new`) por la regla de naming, como en las fases anteriores.
- **Panel sin bloqueo**: `/organizer` es accesible sin sesión, para poder mostrarlo directo.
- **"Mis entradas" como lista con detalle**: en escritorio es lista con detalle al lado; en móvil, la lista arriba y el detalle debajo del pedido elegido, sin navegar a otra pantalla.

## Próximas fases

- Editar evento, "Ver ventas" con gráficos, "Mis eventos" y "Configuración".
- Conexión a un backend real: auth con Google (Auth.js) y correo, pedidos y eventos.
