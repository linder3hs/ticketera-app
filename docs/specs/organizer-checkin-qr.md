# Check-in con QR para el organizador

Estado: aprobada

## Objetivo

Las entradas no sirven en la puerta si nadie las valida. El organizador (dueño del evento) o un admin abre una pantalla de check-in por evento, escanea el QR de la entrada con la cámara (o escribe el código a mano como respaldo) y el sistema marca la entrada como usada, registra el intento y muestra el resultado y cuántos asistentes ya ingresaron. Listo cuando: **el segundo escaneo del mismo QR muestra "ya usada"**.

Referencias: `system-design.md §5.3` (flujo de check-in) y `§3` (roles: el organizador "escanea check-in", permiso `checkin:scan`); `erd.md §3` (Entrada y check-in), `§2` (enums `ticket_status`, `check_in_result`) y `§4` (invariante "Check-in idempotente"). Next 16: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` (`ssr: false` solo en Client Components) y `server-actions.md`.

Estado verificado de la DB: `check_in` y los enums `ticket_status` (`valid, used, cancelled, refunded`) y `check_in_result` (`ok, already_used, invalid, wrong_event`) ya existen (`drizzle/0000`); `ticket.checked_in_at` existe. El QR codifica `ticket.code` crudo (22 caracteres base64url, `generateTicketCode`; `TicketQr.tsx`). Última migración: `0005`.

## Alcance

- Incluye:
  - Ruta `/organizer/events/[id]/check-in` (dentro del grupo `(admin)`, cuyo layout ya exige `organizer`): pantalla con escáner de cámara, formulario de ingreso manual del código **siempre visible** (respaldo), tarjeta de resultado y contador "ingresaron / vendidas".
  - Service `checkInTicket` con el `UPDATE` condicional atómico y el registro de `check_in` en los cuatro resultados (ver "Concurrencia" y Pregunta 1).
  - Autorización: solo dueño del evento o admin/`super_admin`, solo eventos `published` o `finished` (policy pura `canCheckIn`, reutiliza `canViewEvent` y `can(role, "checkin:scan")`).
  - Server action `checkInTicketAction` + hook `useCheckIn` (React Query `useMutation`, el `QueryClientProvider` ya existe en `Providers.tsx`).
  - Contador: tickets `used` vs vendidos (`valid` + `used`), cargado en el servidor y actualizado con cada respuesta.
  - Enlace "Check-in" en la fila del evento del panel (`OrganizerEventRow`).
  - Migración `0006` para que un código desconocido (`invalid`) pueda registrarse (Opción B de la Pregunta 1, recomendada).
- No incluye:
  - Cambios en `panel-nav.ts`: la ruta es por evento (`/organizer/events/[id]/check-in`) y el nav solo lista páginas de primer nivel. `getActiveHref` ya resalta "Eventos" por prefijo `/organizer`.
  - Cambios en `proxy.ts` (`/organizer(.*)` ya está protegido y exige rol mínimo `organizer`).
  - Historial/listado de escaneos, reportes de asistencia, deshacer un check-in, escaneo offline, sonido/vibración, zona/asiento en el resultado, refresco automático del contador entre varias puertas (ver "Próximas fases").
  - Mostrar al comprador el token en "Mis entradas" (ver Pregunta 3).

## Reutilizar

- Autorización: `resolvePolicyActor` (`event/services/event-list-service.ts`), `canViewEvent` (`event.policy.ts`), `can` (`user.permissions.ts`, permiso `checkin:scan` ya definido), `PolicyActor`/`PolicyEvent` (`event-write.types.ts`), `requireRole` (`current-user.ts`).
- Patrones: `requireRole` + zod + try/catch con mensaje genérico de `event/actions.ts` (`run`); "ausente y prohibido se ven igual" de `loadVisibleEvent` (`event-write-service.ts`); página como `organizer/events/[id]/edit/page.tsx` (`z.uuid()` + `notFound()`); `fetchX` + `useX` testeable de `event/hooks/use-events.ts`.
- Drizzle: tablas `ticket`, `checkIn`, `event` de `@/db/schema`; `pgErrorCode` (`src/lib/pg-error.ts`) si hace falta.
- Utilidades: `toLimaTime` (`event-list.utils.ts`) para "ingresó a las HH:mm".
- UI existente: `StatCard`, `Card`, `Badge`, `Button`, `Input`, `form-field` en `src/components/ui`. No hace falta `npx shadcn add` (verificado con `ls src/components/ui`).
- Link de la fila: mismo estilo de los `Link` de acciones de `OrganizerEventRow.tsx`.
- No existe nada equivalente en el repo: ningún lector de QR (solo `uqr`, generador), ningún código que toque `check_in`.

## Archivos

Nuevos (módulo `src/modules/check-in`):

- `check-in.types.ts` — `CheckInResult` (los cuatro valores del enum) y `MissResult` (`Exclude<CheckInResult, "ok"> | "retry"`, tipos distintos), `CheckInStats`, `CheckInOutcome`, `CheckInEvent`, `CheckInActionResult`
- `check-in.schema.ts` (+test) — `checkInInputSchema`
- `check-in.utils.ts` (+test) — `normalizeScannedCode`, `classifyMiss`, `shouldIgnoreScan`, `CHECK_IN_MESSAGES`
- `check-in.policy.ts` (+test) — `canCheckIn`, `CHECK_IN_EVENT_STATUSES`
- `services/check-in-service.ts` — `getCheckInEvent`, `getCheckInStats`, `checkInTicket`
- `actions.ts` — `checkInTicketAction`
- `hooks/use-check-in.ts` (+test) — `checkInRequest`, `useCheckIn`
- `components/CheckInScreen.tsx` (client, compone todo), `QrScanner.tsx` (client, cámara), `ManualCodeForm.tsx`, `CheckInResultCard.tsx`
- `src/app/(admin)/organizer/events/[id]/check-in/page.tsx`

Modificados:

- `src/modules/organizer/components/OrganizerEventRow.tsx` — enlace "Check-in"
- `src/db/schema/ticket.ts`, `drizzle/0006_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json` (generados con `npm run db:generate`) — Opción B
- `package.json`, `package-lock.json` — dependencia del lector (Pregunta 2: `jsqr`)

### Cambio de schema (Opción B, ver Pregunta 1)

`check_in`:

- `ticket_id`: pasa a nullable (hoy `NOT NULL`).
- `event_id uuid NULL` → FK a `event.id`: el evento **de la puerta** donde se escaneó. Se escribe en todas las filas nuevas.
- `scanned_code text NULL`: el texto escaneado, recortado a 64 caracteres. Solo se escribe cuando `ticket_id` es `NULL` (código desconocido); no se duplica el token de entradas reales.
- `CHECK (ticket_id IS NOT NULL OR (event_id IS NOT NULL AND scanned_code IS NOT NULL))`.
- Las filas existentes (si las hubiera) quedan válidas; `relations.ts` no cambia (`one(ticket, fields: [ticketId])` admite nullable). `erd.md` y `system-design.md` no se modifican (son de solo lectura para los agentes): la discrepancia con `erd.md §3` (`check_in.ticket_id`) se reporta aquí.
- Aplicar la migración (`npm run db:migrate`): el humano lo autorizó (decisión 1 y 7); lo ejecuta Claude Code tras generar y revisar el SQL, no el developer. Dev y prod comparten DB, así que es un cambio en datos reales: el SQL debe ser aditivo (ver arriba).

## Definiciones

- **Entrada vendida** = `ticket.status IN ('valid','used')` del evento. Las `cancelled`/`refunded` no cuentan.
- **Ingresó** = `ticket.status = 'used'`.
- **Evento de la puerta** = el `eventId` de la ruta; es el que el actor puede operar y contra el que se valida cada código.
- Resultados (`check_in_result`):
  - `ok`: entrada `valid` del evento de la puerta; pasa a `used`.
  - `already_used`: entrada del evento de la puerta con `status='used'`.
  - `wrong_event`: la entrada existe pero su `event_id` es otro. No se modifica.
  - `invalid`: el código no corresponde a ninguna entrada, o la entrada está `cancelled`/`refunded` (Pregunta 4).

## Concurrencia (neon-http)

`src/db/index.ts` usa `drizzle-orm/neon-http`: sin `db.transaction()` (misma decisión que `event-crud.md` y `stripe-payment-webhook.md`). Cada sentencia es atómica por sí sola; el resultado lo decide el `UPDATE` condicional, no una lectura previa.

1. **Camino `ok` en una sola sentencia** (un CTE con escritura, atómico en Postgres, sin `db.batch`, así que sigue valiendo si prod migra a `pg`):

   ```sql
   with used as (
     update ticket set status = 'used', checked_in_at = now(), updated_at = now()
     where code = $code and event_id = $eventId and status = 'valid'
     returning id, holder_name, checked_in_at
   ), logged as (
     insert into check_in (ticket_id, event_id, scanned_by, result)
     select id, $eventId, $userId, 'ok' from used
     returning id
   )
   select holder_name, checked_in_at from used
   ```

   Va con `db.execute(sql\`…\`)`; hay que fijar `updated_at = now()` explícito porque el SQL crudo no dispara el `$onUpdate` de Drizzle. El `UPDATE` (con `event_id` y `status='valid'` en el `WHERE`) es el único que cambia el estado: dos escaneos simultáneos del mismo QR → una fila para uno, cero para el otro. Si falla el `INSERT`, falla toda la sentencia: nunca queda una entrada `used` sin su `check_in`.
2. **Sin filas** → `SELECT id, event_id, status, holder_name, checked_in_at FROM ticket WHERE code = $code` y `classifyMiss(found, eventId)` (función pura):
   - sin fila → `invalid` (ticket desconocido);
   - `event_id ≠ eventId` → `wrong_event` (se evalúa antes que el estado, así una entrada de otro evento nunca revela si estaba usada);
   - `status = 'used'` → `already_used`;
   - `status IN ('cancelled','refunded')` → `invalid`;
   - `status = 'valid'` en el mismo evento → `retry` (solo posible si el estado cambió entre las dos sentencias; el service responde "Intenta de nuevo" y **no** registra nada).
3. `INSERT INTO check_in` con el `result` (y `ticket_id`, o `scanned_code` si no hay ticket) como segunda sentencia. Un fallo aquí no puede revertir nada (el ticket de los casos no-`ok` no cambió): se registra con `console.error` y se responde igualmente el resultado, que ya es correcto.
4. `getCheckInStats` (un `SELECT` con `count(*) FILTER`, índice `ticket_event_id_status_idx`) al final; el resultado y el contador viajan juntos en la respuesta.

Ventana tolerada: el evento se cancela/despublica entre la comprobación de la policy y el `UPDATE`; no se protege con guarda (YAGNI, el organizador está en la puerta).

## Criterios de aceptación

- AC1: **segundo escaneo = "ya usada"**. Escanear (o ingresar) dos veces el mismo código de una entrada `valid` del evento: el primero responde `ok`; el segundo `already_used` mostrando "Entrada ya usada" y la hora de ingreso (`toLimaTime`). `ticket.checked_in_at` no cambia en el segundo y queda una fila `check_in` `already_used` con ese `ticket_id`.
- AC2: un escaneo `ok` deja `ticket.status='used'`, `checked_in_at` fijado, y una fila `check_in` (`ok`, `scanned_by` = id del usuario de la sesión, `event_id` = evento de la puerta). La UI muestra "Entrada válida" y el nombre del titular.
- AC3: una entrada válida de **otro** evento responde `wrong_event` ("Entrada de otro evento"), no se modifica y queda un `check_in` `wrong_event` con su `ticket_id`. El mensaje no revela datos del otro evento.
- AC4: un código que no existe (basura, otro QR, texto vacío tras normalizar se rechaza antes por zod) responde `invalid` ("Entrada no válida") y, con la Opción B, queda un `check_in` con `ticket_id NULL`, `event_id` y `scanned_code` (≤64). Una entrada `cancelled`/`refunded` también responde `invalid`, con su `ticket_id`, sin modificarse.
- AC5: dos escaneos simultáneos del mismo código válido producen exactamente un `ok` y un `already_used`; no hay `ok` sin su fila `check_in`.
- AC6: solo el dueño (`organizer` **aprobado** con `organizer.id` igual al del evento; `pending`/`suspended` no, decisión 5) y `admin`/`super_admin` pueden abrir la pantalla y escanear, y solo en eventos `published` o `finished`. Otro organizador, un organizador sin perfil o un evento `draft`/`cancelled`: la página responde `notFound()`, y la action devuelve error genérico **sin modificar tickets ni escribir `check_in`**, aunque se invoque directamente. Un `customer` o sin sesión no llegan (layout/`proxy.ts`/`requireRole`).
- AC7: el contador muestra "ingresaron / vendidas" (p. ej. 12 / 80), se carga en el servidor, se actualiza con cada respuesta de la action y solo sube tras un `ok`.
- AC8: el escáner pide la cámara trasera (`facingMode: environment`), decodifica el QR y envía el código a la action sin que el usuario pulse nada. Mensajes claros para: permiso denegado, sin cámara, contexto no seguro (la cámara exige HTTPS o `localhost`). En esos casos y siempre, el ingreso manual sigue disponible y funciona igual.
- AC9: la cámara decodifica varias veces por segundo y el QR puede seguir en cuadro tras un `ok`: el mismo código se ignora mientras hay una petición en curso y hasta que el escáner se "rearme" (`shouldIgnoreScan`, estado puro sobre la secuencia de decodificaciones: se rearma cuando se decodifica un código distinto o tras N cuadros consecutivos sin decodificar nada, es decir, cuando el QR salió de cuadro). Así no se generan filas `already_used` espurias. Para AC1 con cámara: retirar el QR y volver a presentarlo muestra "ya usada". El ingreso manual no está sujeto al rearme.
- AC10: la cámara se detiene (tracks cerrados) al desmontar la pantalla; `QrScanner` se carga solo en el cliente con `next/dynamic` `ssr: false` desde `CheckInScreen` (Client Component) y `jsqr` se importa de forma estática dentro de `QrScanner` (un solo mecanismo de carga diferida).
- AC11: el resultado se anuncia con `role="status"`/`aria-live="polite"`, con icono + texto + color (no solo color) y distingue `ok`, `already_used`, `wrong_event` e `invalid`.
- AC12: la entrada se valida con zod en la action (`eventId` uuid, `code` normalizado: espacios/saltos eliminados, 1–256 caracteres crudos). El formato del código **no** se exige en el schema: un texto que no parece token se responde (y registra) como `invalid`. Los errores del servidor no filtran detalles (`console.error` + mensaje genérico).
- AC13: las filas publicadas/finalizadas de `/organizer` muestran un enlace "Check-in" a `/organizer/events/{id}/check-in`; las demás no. La UI solo oculta; el gate real es la policy en el servidor.
- AC14: `npm run db:generate` produce `0006` con los cambios descritos y, tras generarla, no deja diffs pendientes; el proyecto compila (`relations.ts` y tipos de `checkIn` siguen válidos con `ticketId` nullable).

## Tests requeridos

Vitest, junto al archivo. Los services con DB no se prueban con mocks de Drizzle (convención de `organizer-dashboard-real-data.md`); su lógica de decisión vive en funciones puras.

- `check-in.utils.test.ts`:
  - `normalizeScannedCode`: recorta, elimina espacios/saltos internos, conserva mayúsculas/minúsculas y `-`/`_`.
  - `classifyMiss`: los cinco casos (sin fila → `invalid`; otro evento → `wrong_event`, incluso si estaba `used`; `used` → `already_used`; `cancelled` y `refunded` → `invalid`; `valid` mismo evento → `retry`).
  - `shouldIgnoreScan`: mismo código sin haber salido de cuadro, mismo código tras N cuadros vacíos (rearmado), código distinto, petición en curso.
  - `CHECK_IN_MESSAGES` tiene entrada para los cuatro resultados.
- `check-in.schema.test.ts`: `eventId` no-uuid, `code` vacío/solo espacios, código con espacios internos normalizado, código > 256, formato no-token aceptado.
- `check-in.policy.test.ts`: dueño sí; otro organizador no; organizador sin perfil (`organizerId` null) no; `admin`/`super_admin` sí; `customer` no; `published`/`finished` sí, `draft`/`cancelled` no; organizador dueño `approved` sí, `pending`/`suspended` no (decisión 5; `PolicyActor` debe exponer el estado del organizador — si no lo hace, T1 lo resuelve en `check-in-service.ts`/`getCheckInEvent` sin tocar archivos ajenos).
- `use-check-in.test.ts`: `checkInRequest` devuelve los datos si la action responde `ok`; lanza con el mensaje del servidor si no (mismo estilo que `use-events.test.ts`, `vi.mock` de la action).
- Sin test unitario: `QrScanner.tsx` (jsdom no tiene `getUserMedia`/cámara), el service con DB y la migración. Verificación manual en el cierre de T3: `npm run dev` en `localhost`, escanear un QR de "Mis entradas" dos veces; probar permiso denegado e ingreso manual.

## Tareas

### T0 — Base: schema, migración y dependencia

- Archivos: `src/db/schema/ticket.ts`, `drizzle/0006_*.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json`, `package.json`, `package-lock.json`
- Depende de: —
- Paralelizable: sí
- Cubre: AC14 (y habilita AC4, AC10). Si se elige la Opción A (Pregunta 1), T0 queda solo con la dependencia y sin cambios de schema/migración.

### T1 — Dominio puro, policy y service

- Archivos: `src/modules/check-in/check-in.types.ts`, `check-in.schema.ts` (+test), `check-in.utils.ts` (+test), `check-in.policy.ts` (+test), `services/check-in-service.ts`
- Depende de: T0 (el service escribe `check_in.event_id`/`scanned_code`; los archivos puros pueden avanzar antes)
- Paralelizable: no
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC9, AC12

### T2 — Action y hook

- Archivos: `src/modules/check-in/actions.ts`, `src/modules/check-in/hooks/use-check-in.ts` (+test)
- Depende de: T1
- Paralelizable: no
- Cubre: AC6, AC12 (y el soporte de AC1, AC7)

### T3 — Pantalla de check-in y ruta

- Archivos: `src/modules/check-in/components/CheckInScreen.tsx`, `QrScanner.tsx`, `ManualCodeForm.tsx`, `CheckInResultCard.tsx`, `src/app/(admin)/organizer/events/[id]/check-in/page.tsx`
- Depende de: T0, T2
- Paralelizable: no
- Cubre: AC1, AC2, AC6, AC7, AC8, AC9, AC10, AC11

### T4 — Enlace desde el panel

- Archivos: `src/modules/organizer/components/OrganizerEventRow.tsx`
- Depende de: T1 (importa `CHECK_IN_EVENT_STATUSES` de `check-in.policy.ts`)
- Paralelizable: sí (con T2 y T3, una vez hecho T1)
- Cubre: AC13

## Decisiones del humano

Respondidas en el chat; prevalecen sobre el texto de "Preguntas abiertas" (que queda como contexto):

1. Opción B: migración `0006`, y **se aplica** (`npm run db:migrate`) tras generarla.
2. Librería: `jsqr`.
3. Opción (c): no se toca `TicketDetailCard.tsx` ni "Mis entradas"; basta con que el escaneo del QR sea válido. El ingreso manual queda como respaldo con el token.
4. Sin mensaje nuevo: `cancelled`/`refunded` siguen respondiendo `invalid`.
5. Se exige `organizerStatus='approved'` para que un organizador dueño escanee (admin/`super_admin` no lo necesitan). Un dueño `pending`/`suspended`: `notFound()` en la página y error genérico en la action.
6. Contador sin polling: basta recargar.
7. Dev y prod comparten la misma DB (Neon): la migración se aplica una sola vez.

## Preguntas abiertas

1. **`invalid` vs `check_in.ticket_id NOT NULL` (decisión humana).** `system-design.md §5.3` pide registrar siempre un `check_in`, pero `ticket_id` es `NOT NULL` y un código desconocido no tiene ticket. Los otros tres resultados sí tienen ticket.
   - **Opción B (recomendada, la que describe esta spec):** migración `0006`: `ticket_id` nullable + `event_id` FK + `scanned_code` + CHECK. Cumple "registrar siempre", deja rastro de intentos con códigos falsos por evento. Costo: una migración y tocar `erd.md §3` más adelante (lo hace un humano).
   - **Opción A:** sin migración. `invalid` por código desconocido solo se muestra y se escribe con `console.warn`; `invalid` con ticket (cancelado/reembolsado) y los demás sí se registran. Más chico, pero contradice "registrar siempre". Si se elige A: T0 pierde schema/migración, se omiten `event_id`/`scanned_code` en el `INSERT`/CTE y el AC4 deja de exigir fila para código desconocido.
2. **Librería de escaneo (recomendación: `jsqr`).** `package.json` solo tiene `uqr` (generador).
   - `jsqr` (recomendada): headless (ImageData → texto), JS puro sin worker ni WASM, sin acoplamiento a React ni al bundler, funciona en Safari/iOS y con React 19/Turbopack. Costo: bucle propio `getUserMedia` + `requestAnimationFrame` + canvas (~50 líneas en `QrScanner.tsx`, decodificando ~5–10 veces/s) y la librería está estable pero poco mantenida.
   - `qr-scanner` (Nimiq): usa `BarcodeDetector` nativo si existe y un worker si no; maneja cámara y limpieza. Mejor rendimiento, pero no pude verificar el empaquetado del worker con Turbopack/Next 16 (no hay `node_modules` en el worktree).
   - `BarcodeDetector` nativo + `jsqr` de respaldo: sin dependencias en Chrome/Android, pero hay que mantener dos caminos (Safari/Firefox no lo tienen estable). No vale la pena en fase 1.
   - `@zxing/browser`: más pesado, mantenimiento irregular. `html5-qrcode`: sin mantenimiento y maneja su propio DOM (choca con React 19/StrictMode). No recomendadas.
   - La elección queda aislada en `QrScanner.tsx` (contrato `onDecode(text: string)`), así cambiar de librería no toca nada más.
3. **El ingreso manual no coincide con lo que ve el comprador.** El QR codifica `ticket.code` (22 caracteres), pero `TicketDetailCard.tsx:38` muestra como "Código" `order.code-NN` (no es el token). Con la fase 1 por defecto, el respaldo manual solo acepta el token; sin forma de que el comprador lo lea o copie, el respaldo sirve poco. Opciones: (a) mostrar/copiar el token en `TicketDetailCard.tsx` (cambio chico; se puede sumar a T4, que pasaría a ser dueña de ambos archivos, sin superar 5 tareas); (b) resolver `order.code-NN` (ambiguo: el índice depende del orden de los `order_item`, no estable); (c) dejarlo para una spec de seguimiento. Recomendación: (a).
4. **Entradas `cancelled`/`refunded` al escanear.** El enum no tiene un valor para "anulada". Por defecto responden `invalid` (con su `ticket_id` registrado). ¿Se quiere un mensaje distinto en pantalla ("Entrada anulada/reembolsada") sin cambiar el enum?
5. **Reglas de acceso por defecto.** (a) Estados permitidos: `published` y `finished`; `draft`/`cancelled` no. (b) Sin ventana horaria (no se usa `isEventReadOnly`, que bloquearía justo cuando ya empezó el evento). (c) Un organizador dueño `pending`/`suspended` **sí** puede escanear (no se castiga a los asistentes). ¿Correcto, o se exige `organizerStatus='approved'` / una ventana (p. ej. desde 12 h antes)?
6. **Contador.** Se define "vendidas" = `valid + used` y se actualiza solo con las respuestas de esta pantalla; otra puerta que escanee en paralelo se ve al recargar. ¿Se quiere refresco periódico (polling) desde la fase 1?
7. **Aplicación de la migración.** `0006` se genera pero no se aplica en esta spec. ¿Quién la aplica en Neon (dev) y en prod?

## Próximas fases

- Refresco periódico del contador (React Query `refetchInterval`) y vista de actividad reciente de escaneos.
- Mostrar zona/asiento y tipo de entrada en el resultado de la puerta.
- Historial y reporte de asistencia por evento (incluye intentos `invalid`/`already_used`).
- Mostrar/copiar el token en "Mis entradas" si no entra en esta fase (Pregunta 3).
- Sonido/vibración al escanear; modo linterna; escaneo offline con cola.
- Actualizar `erd.md §3`/`§4` con las columnas nuevas de `check_in` (lo hace un humano).
