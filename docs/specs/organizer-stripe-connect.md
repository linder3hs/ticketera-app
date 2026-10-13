# Perfil de organizador y onboarding de Stripe Connect

Estado: aprobada

> **Aprobada por el humano en el chat (2026-10-09), con dos decisiones que prevalecen sobre el resto del documento:**
> 1. **Pregunta #1 resuelta: el país no bloquea.** El proyecto es una demo; se acepta la opción (a) (cuentas de prueba, país/moneda por variable de entorno). No se construye (b) ni (c), y la consulta a ventas de Stripe queda fuera de esta spec.
> 2. **Credenciales ya presentes en `.env`:** `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` y `STRIPE_WEBHOOK_SECRET` ya existen (claves de test). Nadie debe pedirlas, regenerarlas, imprimirlas ni editar `.env`; `.env.example` solo documenta las variables **nuevas** (`STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_CONNECT_ACCOUNT_COUNTRY`, `STRIPE_CONNECT_ACCOUNT_CURRENCY`), que el humano completa. Sin ellas el código falla con un mensaje claro (no se inventan valores por defecto).
>
> El resto de las preguntas abiertas (#2 a #14) se toman con la recomendación de la spec.

## Objetivo

El cobro de una entrada va con `transfer_data.destination` = cuenta Connect del organizador (tarjeta 07); sin esa cuenta no hay checkout real. `system-design.md §5.6` exige "aprobado + Connect completo" para publicar y la spec `event-crud.md` lo dejó fuera ("No incluye"). Esta spec cierra ese hueco:

1. El organizador completa `business_name` y `tax_id` (RUC) en su perfil.
2. Crea su cuenta Connect (Accounts v2) y recorre el onboarding hospedado por Stripe; la app guarda `stripe_account_id` y mantiene `stripe_onboarding_status` (vía webhook, más una sincronización al volver).
3. `getPublishBlockers` / `canPublishEvent` (`event.policy.ts`) exigen `organizer.status = approved` **y** Connect `complete`.
4. Solo el módulo `payment` habla con Stripe.

Hecho cuando: un organizador nuevo completa el onboarding en modo test y recién entonces puede publicar (sujeto a la pregunta abierta #1).

Referencias consultadas: `system-design.md §5.6` (onboarding), §3 "Reglas de límite" (solo `payment` habla con Stripe) y "Roles y autorización" (el chequeo fino de propiedad va contra la DB); `erd.md §3 Identidad` (tabla `organizer`) y §4 ("Webhooks idempotentes" con `stripe_event`).

### Evidencia verificada (docs.stripe.com, 2026-10-09)

- Plataformas nuevas: usar Accounts v2 (`POST /v2/core/accounts`) y no el parámetro legacy `type` de `POST /v1/accounts` (`docs.stripe.com/llms.txt`, `connect/accounts-v2`).
- `stripe-node` 23.0.0 (latest en npm hoy) fija la API `2026-09-30.endive`. Esa versión **elimina** `configurations` de `use_case.account_onboarding` en los Account Links v2 (los requests que lo envíen fallan) y agrega el estado `rejected` a las capabilities v2. El quickstart de marketplace aún muestra `configurations: ['recipient']`: es pre-endive y **no se copia**.
- Estado de capabilities v2: `active | pending | restricted | unsupported | rejected` (`connect/track-account-onboarding`, changelog endive).
- Con `dashboard: "express"` y Stripe cobrando los requisitos no existen Account Links `account_update`; "continuar" es siempre `account_onboarding` (`connect/hosted-onboarding`). Los links son de un solo uso y expiran: nunca se guardan.
- `return_url` no prueba que el onboarding terminó: hay que recuperar la cuenta (`connect/hosted-onboarding`). En v2 hay que pedir `include` para que vengan `configuration.recipient` y `requirements`.
- Eventos de cuentas v2 son *thin events* (`v2.core.account[configuration.recipient].capability_status_updated`, `v2.core.account[requirements].updated`), no `account.updated`; se procesan con `parseEventNotification` y se recupera el recurso (`events/how-events-work`, `api/v2/core/events/event-types`).
- Cross-border payouts de Connect: solo plataformas y cuentas en US, UK, EEA, CA, CH; Perú no figura (`connect/cross-border-payouts`). Ver pregunta #1.
- A confirmar por el developer al instalar `stripe@23.0.0`: nombres y tipos exactos en Node (`stripe.v2.core.accounts.create/retrieve`, `stripe.v2.core.accountLinks.create`, `parseEventNotification`, `idempotencyKey` en las opciones de request) y que `AccountLinkCreateParams` ya no incluye `configurations`.

## Alcance

- Incluye:
  - **Perfil**: formulario `business_name` + `tax_id` (zod compartido cliente/servidor) y action para guardarlo en la fila `organizer` del usuario de la sesión. RUC peruano: 11 dígitos, prefijo `10|15|17|20` y **dígito verificador** (módulo 11, pesos 5,4,3,2,7,6,5,4,3,2; verificado contra RUC reales). Sin consulta a SUNAT.
  - **Módulo `payment`** con una interfaz estrecha (`ConnectGateway`) y su única implementación Stripe: crear cuenta v2 (`dashboard: "express"`, `fees_collector: "application"`, `losses_collector: "application"`, `configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested: true`; sin `merchant` ni `card_payments`), crear Account Link de onboarding, leer el estado de `stripe_transfers`, verificar y parsear el webhook. `StripeClient` instanciado (no `stripe.api_key` global).
  - **Estado**: `stripe_account_id` se guarda al crear la cuenta (estado `pending`); `stripe_onboarding_status` pasa a `complete` solo cuando `stripe_transfers.status === 'active'` (nunca se usa `charges_enabled`/`payouts_enabled`). Se actualiza por webhook y con una sincronización al volver del onboarding.
  - **Webhook** `src/app/api/webhooks/stripe-connect/route.ts` que solo delega al módulo `payment` (firma + sync). Idempotente con la tabla `stripe_event` que ya existe.
  - **Gate de publicación** en `event.policy.ts` (`getPublishBlockers`, `canPublishEvent`) con el estado entrando como dato; espejo en la cláusula SQL de `setEventStatus`.
  - **UI**: página `/organizer/settings` (perfil + estado de pagos con "Configurar pagos" / "Continuar onboarding"), ruta de refresh del Account Link, aviso en el dashboard y motivo de publicación denegada que incluye Connect.
  - **Migración mínima** (T0): índice único sobre `organizer.stripe_account_id`.
- No incluye:
  - PaymentIntent, `application_fee_amount`, checkout real (tarjeta 07) y webhook de pagos (tarjeta 08).
  - Onboarding embebido (Connect embedded components), `notification_banner` y Express Dashboard link: requieren componentes embebidos; van a una fase posterior (el onboarding hospedado cubre la fase 1).
  - Onboarding por API (recolectar datos del organizador en la app), Account Links `account_update`.
  - Auto-despublicar eventos cuando Connect deja de estar `complete`; reembolsos; desvincular/eliminar la cuenta Connect.
  - Enviar el RUC a Stripe (Stripe recolecta su propio KYC), unicidad del RUC, consulta a SUNAT.
  - Cambiar el flujo de aprobación de organizadores (ver pregunta #3) ni el enum `organizer_status`.
  - Cambios en `proxy.ts` (ya protege `/organizer`; el webhook queda fuera de las rutas protegidas).

### Decisiones de diseño

**Límite de módulo (regla de `§3`).** Solo `src/modules/payment/services/stripe-client.ts` y `stripe-connect-gateway.ts` importan `stripe`. `user`, `organizer` y `event` leen el estado desde la DB (`organizer.stripe_onboarding_status`) o llaman funciones exportadas de `payment`; nunca el SDK. El reviewer lo comprueba con `grep -rn "from \"stripe\"" src`.

**API pública mínima de `payment`** (todo del lado servidor):

- `startConnectOnboarding(user)` → `{ ok: true, url } | { ok: false, error }`. Crea la cuenta si falta y devuelve un Account Link nuevo.
- `syncConnectStatus(accountId)` → recupera la cuenta, mapea y guarda el estado; `null` si ninguna `organizer` tiene ese `stripe_account_id`.
- `refreshConnectStatus(user)` → `syncConnectStatus` del organizador de la sesión (para el retorno del onboarding).
- `handleConnectWebhook(payload, signature)` → `{ status: 200 | 400 | 500 }`.
- Server action `startConnectOnboardingAction()` (`payment/actions.ts`).
- `ConnectGateway` (interfaz en `payment.types.ts`): `createAccount`, `createOnboardingLink`, `getTransfersStatus`, `parseWebhook`. Policy, UI y servicios de `event` no la conocen: si la pregunta #1 se resuelve con otro proveedor, solo se reemplaza el gateway (y el nombre de las columnas `stripe_*` queda como deuda).

**Cómo llega el estado a la policy (pura, sin I/O).** `PolicyActor` gana `stripeOnboardingStatus: StripeOnboardingStatus | null`, resuelto en `resolvePolicyActor` junto con `organizerStatus` (misma consulta: `findOrganizerByUserId` se amplía). `getPublishBlockers(snapshot, now)` acepta `snapshot.organizer?: { status: OrganizerStatus | null; stripeOnboardingStatus: StripeOnboardingStatus | null }`:

- Si `organizer` viene: agrega `organizer_not_approved` (status ≠ `approved`) y `connect_incomplete` (estado ≠ `complete`), **antes** de los blockers del evento.
- Si no viene: solo los blockers del evento (comportamiento actual). Es el caso de `updateEvent` sobre un evento ya `published`: editar, despublicar o cancelar no dependen de Connect (ver pregunta #8). `canPublishEvent` siempre pasa `organizer` (derivado del actor). Riesgo para el reviewer: que ningún camino de *publicar* omita `organizer`.
- Mensajes (`PUBLISH_BLOCKER_MESSAGES`): `organizer_not_approved` = "Tu perfil de organizador debe estar aprobado para publicar."; `connect_incomplete` = "Configura tus pagos en Stripe para poder publicar eventos." El servicio ya responde con el primer blocker (`fail(PUBLISH_BLOCKER_MESSAGES[blocker])`); la UI lo muestra donde ya muestra el motivo de publicación denegada.
- `statusDenial` conserva su rama `MESSAGES.notApproved` (más específica y previa); el blocker de Connect llega por `getPublishBlockers`.
- Helper puro nuevo `canOrganizerPublish(actor)` (= `approved` y `complete`) para que las páginas calculen `canPublish` sin repetir la regla.
- Defensa en profundidad: la cláusula SQL de `setEventStatus` (`status === "published"`) agrega `organizer.stripe_onboarding_status = 'complete'` junto a la de `organizer.status = 'approved'`.

**Máquina de estados de `stripe_onboarding_status`** (el enum actual `not_started | pending | complete` alcanza para el gate; ver pregunta #10):

| Transición | Disparador |
| --- | --- |
| `not_started` → `pending` | Se crea la cuenta y se guarda `stripe_account_id` (mismo `UPDATE`) |
| `pending` → `complete` | Sync con `stripe_transfers.status === 'active'` |
| `complete` → `pending` | Sync con cualquier otro estado (`restricted`, `pending`, `unsupported`, `rejected`) |
| a `not_started` | Nunca (no se desvincula en esta fase) |

Mapeo puro (`payment.utils.ts`): `active` → `complete`; `pending | restricted | unsupported | rejected | ausente` → `pending`. Cada sync usa el estado **recuperado** de la API, nunca el payload del evento: los eventos desordenados o repetidos no pueden dejar un estado viejo. Un estado `rejected` se registra con `console.error` (id de cuenta, sin datos personales) porque la UI no lo distingue.

**Idempotencia y concurrencia de la creación.**

- Si `stripe_account_id` existe: no se crea otra cuenta; solo un Account Link nuevo.
- Si no existe: `createAccount` usa la idempotency key `connect-account:<organizer.id>` y `metadata.organizer_id`; luego `setStripeAccountId` hace `UPDATE ... SET stripe_account_id = ?, stripe_onboarding_status = 'pending' WHERE id = ? AND stripe_account_id IS NULL` y devuelve el id ganador (si otro request llegó antes, usa el suyo). El índice único de T0 es la red de seguridad.
- Si el estado ya es `complete`, `startConnectOnboarding` responde "Tu cuenta de pagos ya está configurada." (con `express` no hay `account_update`).

**Autorización.** El organizador se resuelve en el servidor a partir de la sesión (`requireRole("organizer")` + `findOrganizerByUserId(user.id)`); ningún `organizerId` viene del cliente. Un admin sin fila `organizer` recibe error genérico. Perfil completo (`tax_id` guardado) es prerrequisito de `startConnectOnboarding`, validado en el servidor (el botón además se deshabilita).

**Webhook.** Ruta `src/app/api/webhooks/stripe-connect/route.ts` (patrón de `webhooks/clerk/route.ts`): lee el cuerpo crudo con `request.text()` y el header `stripe-signature` y devuelve lo que diga `handleConnectWebhook`. Flujo del servicio: `parseWebhook` (verifica la firma con `STRIPE_CONNECT_WEBHOOK_SECRET`; firma inválida → 400 sin tocar DB) → si el tipo no es `v2.core.account[configuration.recipient].capability_status_updated` ni `v2.core.account[requirements].updated` → 200 sin hacer nada → si el `id` del evento ya está en `stripe_event` → 200 → `syncConnectStatus(related_object.id)` → registrar el `id` en `stripe_event` **después** del sync (un fallo devuelve 500 y Stripe reintenta; un evento ya registrado no repite trabajo). Cuenta desconocida → 200 sin cambios. **Recomendación de rutas:** webhooks separados. Este es *thin* (eventos v2 de cuentas, secreto `STRIPE_CONNECT_WEBHOOK_SECRET`) y la tarjeta 08 usará `/api/webhooks/stripe` *snapshot* (`payment_intent.*`, `charge.refunded`, ...) con el `STRIPE_WEBHOOK_SECRET` que `.env.example` ya reserva; verificación y destino son distintos y mezclarlos obliga a ramificar por formato.

**Seguridad.** `STRIPE_SECRET_KEY` solo se lee en `stripe-client.ts` (con `import "server-only"`); nada de `payment` se importa desde un componente cliente salvo la server action. El webhook verifica firma siempre. `tax_id` no se loguea ni se devuelve en errores; los errores de Stripe se loguean en servidor (sin PII) y al cliente solo llega un mensaje genérico ("No pudimos iniciar la configuración de pagos. Intenta de nuevo."). Los Account Links no se guardan ni se envían por otro canal que la redirección en sesión.

**Qué sirve según la opción de la pregunta #1**

| Pieza | (a) Región soportada en test | (b) Global Payouts | (c) Otro procesador |
| --- | --- | --- | --- |
| Campos de perfil + RUC, formulario, schema | Sirve | Sirve | Sirve |
| Gate en `event.policy.ts` / `event-write-service` | Sirve | Sirve (el estado se llama igual) | Sirve |
| Columnas `organizer.*` y UI de estado | Sirve | Sirve | Sirve (renombrar `stripe_*` sería deuda) |
| `ConnectGateway` (cuenta v2, Account Link, webhook thin) | Sirve tal cual | Se reemplaza (destinatario de payout, no cuenta Connect) | Se reemplaza |
| Tarjetas 07/08 (`transfer_data.destination`) | Sirven | Cambian: cobro en la plataforma y payout posterior | Cambian |

## Reutilizar

- `src/modules/user/services/user-service.ts`: `findOrganizerByUserId` (se **amplía**, no se duplica) y el patrón de `setOrganizerStatus`/`upsertOrganizer`; no se crea `organizer-service`.
- `src/modules/user/current-user.ts` (`requireRole`) y `user.permissions.ts` (`can`, `hasRole`) para autorizar; `ActionResult` de `user.types.ts` como forma de resultado en la action de perfil.
- `src/modules/event/event.policy.ts` (`getPublishBlockers`, `PUBLISH_BLOCKER_MESSAGES`, `canPublishEvent`), `event-write.types.ts` (`PolicyActor`, `PublishBlocker`), `event-list-service.ts` (`resolvePolicyActor`), `event-write-service.ts` (`statusDenial`, guard SQL de `setEventStatus`).
- `src/db/schema/order.ts` `stripeEvent` (idempotencia) y `src/db/schema/identity.ts` `organizer` (columnas ya existentes: `business_name` NOT NULL, `tax_id`, `stripe_account_id`, `stripe_onboarding_status`, `status`).
- `src/app/api/webhooks/clerk/route.ts` como molde de la ruta del webhook.
- UI ya instalada: `src/components/ui` `card`, `badge`, `button`, `input`, `form-field`; patrón de aviso y de `publishDeniedReason` de `OrganizerDashboard.tsx` y `OrganizerEventRow.tsx`; `getNavSections` de `panel-nav.ts`. No hace falta `npx shadcn add`.
- Patrón de server actions y de zod compartido: `src/modules/user/actions.ts`, `user.schema.ts`.
- No existe nada de Stripe en `src/`; `stripe` no está instalado (T0).

## Archivos

Nuevos (N) y modificados (M), con su tarea dueña:

- **T0**: `package.json` (M, `stripe` exacto `23.0.0`), `package-lock.json` (M), `.env.example` (M), `src/db/schema/identity.ts` (M, `.unique()` en `stripeAccountId`), `drizzle/0002_<nombre>.sql` y `drizzle/meta/*` (N/M, generados con `npm run db:generate`).
- **T1**: `src/modules/user/user.types.ts` (M), `src/modules/user/services/user-service.ts` (M), `src/modules/organizer/organizer.schema.ts` (N), `src/modules/organizer/organizer.schema.test.ts` (N), `src/modules/organizer/actions.ts` (N).
- **T2**: `src/modules/payment/payment.types.ts`, `payment.utils.ts`, `payment.utils.test.ts`, `actions.ts`, `services/stripe-client.ts`, `services/stripe-connect-gateway.ts`, `services/stripe-event-service.ts`, `services/connect-service.ts`, `services/connect-service.test.ts`, `services/connect-webhook-service.ts`, `services/connect-webhook-service.test.ts` (todos N), `src/app/api/webhooks/stripe-connect/route.ts` (N).
- **T3**: `src/modules/event/event-write.types.ts` (M), `src/modules/event/event.policy.ts` (M), `src/modules/event/event.policy.test.ts` (M), `src/modules/event/services/event-list-service.ts` (M), `src/modules/event/services/event-write-service.ts` (M).
- **T4**: `src/modules/organizer/components/OrganizerProfileForm.tsx`, `src/modules/organizer/components/ConnectStatusCard.tsx`, `src/app/(admin)/organizer/settings/page.tsx`, `src/app/(admin)/organizer/settings/connect/refresh/route.ts` (N); `src/modules/organizer/components/OrganizerDashboard.tsx`, `src/app/(admin)/organizer/page.tsx`, `src/app/(admin)/organizer/events/new/page.tsx`, `src/app/(admin)/organizer/events/[id]/edit/page.tsx`, `src/modules/panel/panel-nav.ts`, `src/modules/panel/panel-nav.test.ts` (M).

Detalle de contenido:

- `.env.example`: `STRIPE_CONNECT_WEBHOOK_SECRET` (destino thin de este webhook), `STRIPE_CONNECT_ACCOUNT_COUNTRY` y `STRIPE_CONNECT_ACCOUNT_CURRENCY` (país/moneda de la cuenta conectada; dependen de la pregunta #1) y aclarar en el comentario de `STRIPE_WEBHOOK_SECRET` que es para el webhook de pagos (08).
- `user-service.ts`: `findOrganizerByUserId` devuelve además `businessName`, `taxId`, `stripeAccountId`, `stripeOnboardingStatus` (los consumidores actuales siguen usando `id`/`status`); nuevos `updateOrganizerProfile(userId, { businessName, taxId })`, `setStripeAccountId(organizerId, accountId)` (condicional, descrito arriba) y `setStripeOnboardingStatus(accountId, status)` (devuelve si encontró fila). Ninguna importa Stripe.
- `user.types.ts`: `StripeOnboardingStatus` derivado del enum de Drizzle (mismo estilo que `OrganizerStatus`).
- `organizer.schema.ts`: `organizerProfileSchema` (`businessName`: trim, 2–120; `taxId`: solo dígitos, regla del RUC) y la función pura `isValidRuc`.
- `payment.types.ts`: `ConnectGateway`, `TransfersStatus` (`active | pending | restricted | unsupported | rejected`), `ConnectLinkResult`, error `WebhookSignatureError`.
- `payment.utils.ts`: `mapTransfersStatus` y la lista `CONNECT_EVENT_TYPES`.
- `stripe-client.ts`: `getStripeClient()` perezoso (`new StripeClient(STRIPE_SECRET_KEY)`; falla claro si falta la clave; la versión de API es la que fija el SDK 23.0.0 = `2026-09-30.endive`, sin override).
- `stripe-connect-gateway.ts`: `createAccount` (`display_name` = `business_name`, `contact_email` = email del usuario, `identity.country`/`defaults.currency` desde env, `identity.entity_type: "company"` fijo en fase 1 (un RUC `10` es persona natural, pero la cuenta de prueba no depende del RUC; se revisa junto con la pregunta #1), idempotency key, `metadata.organizer_id`), `createOnboardingLink` (`use_case.type: "account_onboarding"`, **sin** `configurations`; `return_url` = `${APP_URL}/organizer/settings?connect=return`, `refresh_url` = `${APP_URL}/organizer/settings/connect/refresh`), `getTransfersStatus` (retrieve con `include: ["configuration.recipient", "requirements"]`), `parseWebhook`.
- `stripe-event-service.ts`: `hasProcessedStripeEvent(id)` y `markStripeEventProcessed(id, type)` (`ON CONFLICT DO NOTHING`); lo reutilizará la tarjeta 08.
- Refresh route: `GET`; exige sesión de organizador; llama `startConnectOnboarding` y redirige al link nuevo; si ya está `complete` o falla, redirige a `/organizer/settings`.
- Settings page: `requireRole("organizer")`; si no hay fila `organizer` → `redirect("/organizer")`; con `?connect=return` llama `refreshConnectStatus` (errores solo se loguean) antes de renderizar el estado de la DB.
- `ConnectStatusCard`: `not_started` → badge "Sin configurar", botón "Configurar pagos"; `pending` → "En proceso", botón "Continuar onboarding"; `complete` → "Pagos configurados", sin botón. Botón deshabilitado con texto de ayuda si falta el RUC. El botón llama la server action y hace `window.location.assign(url)`; muestra el error devuelto.
- `organizer/page.tsx`: obtiene el actor con `resolvePolicyActor(user)` (no arma el literal `PolicyActor` a mano) y de ahí `canCreateEvent` y el estado de Connect, para no duplicar la regla del gate en una ruta.
- Dashboard: aviso con enlace a `/organizer/settings` cuando Connect ≠ `complete`; el motivo de "no puedes publicar" prioriza aprobación y luego Connect (texto: `connect_incomplete`).
- `panel-nav.ts`: ítem "Configuración" (`/organizer/settings`) en la sección Organizador.

## Criterios de aceptación

- AC1: `organizerProfileSchema` acepta `businessName` de 2 a 120 caracteres (tras `trim`) y un RUC de 11 dígitos con prefijo `10|15|17|20` y dígito verificador correcto; rechaza longitud distinta, caracteres no numéricos, prefijo inválido y dígito verificador incorrecto, con mensajes en español.
- AC2: `updateOrganizerProfileAction` guarda `business_name` y `tax_id` solo en la fila `organizer` del usuario de la sesión; un cliente sin fila `organizer` (admin, customer) recibe error; la entrada inválida responde "Datos inválidos." sin repetir el RUC; `tax_id` no aparece en ningún log.
- AC3: `startConnectOnboarding` falla si el organizador no tiene `tax_id` guardado; el botón "Configurar pagos" se muestra deshabilitado con una ayuda en ese caso.
- AC4: la primera llamada crea **una** cuenta v2 con `dashboard: "express"`, `fees_collector` y `losses_collector` = `application`, solo la capability `recipient.stripe_balance.stripe_transfers` solicitada, guarda `stripe_account_id` con estado `pending` y devuelve un Account Link `account_onboarding` (sin `configurations`) con `return_url` y `refresh_url` propios; el cliente redirige a esa URL.
- AC5: llamar de nuevo (también dos veces en paralelo) no crea una segunda cuenta ni cambia `stripe_account_id`: reutiliza la existente y devuelve un link nuevo. Con estado `complete` responde "Tu cuenta de pagos ya está configurada." sin llamar a Stripe.
- AC6: `GET /organizer/settings/connect/refresh` con sesión de organizador redirige a un Account Link nuevo; sin sesión o sin fila `organizer` no llama a Stripe; en error o con `complete` redirige a `/organizer/settings`.
- AC7: `mapTransfersStatus` devuelve `complete` solo para `active`; `pending`, `restricted`, `unsupported`, `rejected` y ausente devuelven `pending`. Ningún código usa `charges_enabled` ni `payouts_enabled`.
- AC8: `syncConnectStatus` recupera la cuenta (con `include`), mapea y actualiza `stripe_onboarding_status` de la fila con ese `stripe_account_id`; una cuenta que vuelve a `restricted` baja de `complete` a `pending`; cuenta desconocida devuelve `null` sin escribir.
- AC9: `POST /api/webhooks/stripe-connect`: firma inválida o ausente → 400 sin lecturas ni escrituras en DB; tipo de evento no relevante → 200 sin sync; evento relevante → sync con el estado recuperado de la API (no del payload) y registro en `stripe_event` después del sync; el mismo `id` de evento repetido → 200 sin nuevo sync; error en el sync → 500 y el evento no queda registrado.
- AC10: al volver con `?connect=return`, la página sincroniza el estado antes de renderizar, de modo que un organizador que terminó el onboarding ve "Pagos configurados" sin esperar el webhook; si el sync falla, muestra el estado guardado.
- AC11: solo `src/modules/payment/services/stripe-client.ts` y `stripe-connect-gateway.ts` importan `stripe`; ningún archivo con `"use client"` importa algo que lo arrastre; `STRIPE_SECRET_KEY` no aparece fuera de `stripe-client.ts`.
- AC12: `getPublishBlockers` con `organizer` agrega `organizer_not_approved` cuando `status ≠ approved` y `connect_incomplete` cuando el estado ≠ `complete`, antes de los blockers del evento; sin `organizer` no agrega ninguno. `canPublishEvent` es `false` para un organizador `approved` con Connect `pending`/`not_started` y `true` con `complete` (si el resto está listo).
- AC13: publicar (`setEventStatus` → `published`) con Connect incompleto falla con "Configura tus pagos en Stripe para poder publicar eventos."; el `UPDATE` condicional exige además `stripe_onboarding_status = 'complete'`; editar un evento ya `published`, despublicarlo y cancelarlo no dependen de Connect.
- AC14: `EventForm` recibe `canPublish` = `canOrganizerPublish(actor)` en `new` y `edit`; el dashboard muestra el aviso/motivo cuando Connect ≠ `complete` y el botón de la tarjeta dice "Configurar pagos" (`not_started`), "Continuar onboarding" (`pending`) o nada (`complete`).
- AC15: los errores de Stripe nunca llegan al cliente: la action devuelve un mensaje genérico y el detalle se loguea en servidor sin `tax_id`.
- AC16: solo cambia el schema con el índice único de `stripe_account_id`; `npm run db:generate` no produce otros cambios.
- AC17 (manual, modo test, sujeto a #1): un organizador nuevo completa el RUC, hace el onboarding hospedado con datos de prueba de Stripe, vuelve, ve "Pagos configurados" y recién entonces puede publicar un borrador válido; antes de eso la publicación está bloqueada.

## Tests requeridos

Vitest, junto al archivo (los servicios con DB existentes en el repo no tienen tests de integración; aquí se prueba la lógica con el gateway inyectado y `vi.mock` de `user-service`/`stripe-event-service`):

- `src/modules/organizer/organizer.schema.test.ts`: `isValidRuc` y `organizerProfileSchema` (AC1). RUC válidos para el test: `20131312955`, `20100070970`, `20100047218`; inválidos: `20100070971` (dígito), `10456789012` (dígito), `30100070970` (prefijo), 10 y 12 dígitos, letras, espacios.
- `src/modules/payment/payment.utils.test.ts`: `mapTransfersStatus` para los 5 estados y ausente; `CONNECT_EVENT_TYPES` (AC7).
- `src/modules/payment/services/connect-service.test.ts` (gateway falso, `user-service` mockeado): primera creación (parámetros, `setStripeAccountId`, link), reutilización de cuenta existente, carrera perdida (usa el id ganador), `complete` no llama a Stripe, sin `tax_id`, sin fila `organizer`, error del gateway → mensaje genérico; `syncConnectStatus` (AC4, AC5, AC8, AC15).
- `src/modules/payment/services/connect-webhook-service.test.ts`: firma inválida → 400, tipo irrelevante → 200, evento repetido → 200, relevante → sync + registro, error de sync → 500 sin registro, cuenta desconocida → 200 (AC9).
- `src/modules/event/event.policy.test.ts` (ampliar; actualizar los fixtures de `PolicyActor` con el campo nuevo): `getPublishBlockers` con y sin `organizer`, orden de blockers, `canPublishEvent`, `canOrganizerPublish`, `getEventCapabilities` con Connect incompleto (AC12, AC13 en su parte pura).
- `src/modules/panel/panel-nav.test.ts` (ajustar): el ítem "Configuración" aparece para `organizer` y superiores y no para `customer`.
- Sin tests unitarios para `user-service.ts`, `stripe-connect-gateway.ts`, rutas y componentes (DB/SDK/visuales); se cubren por revisión y por AC17.

## Tareas

### T0 — Base: dependencia, variables de entorno y migración
- Archivos: `package.json`, `package-lock.json`, `.env.example`, `src/db/schema/identity.ts`, `drizzle/0002_*.sql`, `drizzle/meta/*`
- Depende de: — (y de que `reservation-hold` ya esté en main si esa tarea también genera migración, para no chocar en la numeración de `drizzle/`)
- Paralelizable: sí (con T1)
- Cubre: AC16, base de AC4/AC11

### T1 — Perfil del organizador y acceso a datos
- Archivos: `src/modules/user/user.types.ts`, `src/modules/user/services/user-service.ts`, `src/modules/organizer/organizer.schema.ts`, `src/modules/organizer/organizer.schema.test.ts`, `src/modules/organizer/actions.ts`
- Depende de: —
- Paralelizable: sí (con T0)
- Cubre: AC1, AC2, base de AC3/AC5/AC8

### T2 — Módulo `payment` (Connect, gateway, servicios y webhook)
- Archivos: `src/modules/payment/payment.types.ts`, `payment.utils.ts`, `payment.utils.test.ts`, `actions.ts`, `services/stripe-client.ts`, `services/stripe-connect-gateway.ts`, `services/stripe-event-service.ts`, `services/connect-service.ts`, `services/connect-service.test.ts`, `services/connect-webhook-service.ts`, `services/connect-webhook-service.test.ts`, `src/app/api/webhooks/stripe-connect/route.ts`
- Depende de: T0, T1
- Paralelizable: sí (con T3, archivos disjuntos)
- Cubre: AC3, AC4, AC5, AC7, AC8, AC9, AC11, AC15

### T3 — Gate de publicación (policy y servicios de evento)
- Archivos: `src/modules/event/event-write.types.ts`, `src/modules/event/event.policy.ts`, `src/modules/event/event.policy.test.ts`, `src/modules/event/services/event-list-service.ts`, `src/modules/event/services/event-write-service.ts`
- Depende de: T1 (y de que la tarea 05 `reservation-hold` esté commiteada: `event-write-service.ts` tiene hoy cambios sin commitear de esa tarea y este trabajo no debe mezclarse con ellos)
- Paralelizable: sí (con T2, tras T1)
- Cubre: AC12, AC13

### T4 — UI y rutas del organizador
- Archivos: `src/modules/organizer/components/OrganizerProfileForm.tsx`, `src/modules/organizer/components/ConnectStatusCard.tsx`, `src/modules/organizer/components/OrganizerDashboard.tsx`, `src/app/(admin)/organizer/settings/page.tsx`, `src/app/(admin)/organizer/settings/connect/refresh/route.ts`, `src/app/(admin)/organizer/page.tsx`, `src/app/(admin)/organizer/events/new/page.tsx`, `src/app/(admin)/organizer/events/[id]/edit/page.tsx`, `src/modules/panel/panel-nav.ts`, `src/modules/panel/panel-nav.test.ts`
- Depende de: T1, T2, T3
- Paralelizable: no
- Cubre: AC6, AC10, AC14, AC17 (y la parte visible de AC3)

## Preguntas abiertas

**#1 BLOQUEANTE para aprobar: disponibilidad de Stripe Connect para Perú.** Evidencia (`connect/cross-border-payouts`, changelog 2026-02-25, consultada hoy): los cross-border payouts de Connect solo existen entre plataformas y cuentas en US, UK, EEA, CA y CH; "Stripe no soporta cross-border payouts self-serve a países fuera de esas regiones". Perú solo aparece en Global Payouts (plataformas US/UK, pago directo a cuenta bancaria de un tercero, sin cuentas Connect; además `connect/accounts-v2` indica que las cuentas bajo *recipient service agreement* requieren Accounts v1 y no admiten cross-border en Connect). El proyecto cobra en PEN a organizadores peruanos con RUC; no está confirmado en qué país estaría la cuenta de plataforma ni que un organizador peruano pueda ser cuenta conectada. Afecta también a la tarjeta 07 (`transfer_data.destination` + `application_fee_amount`).
- (a) Plataforma y organizadores en una región soportada **solo para test/demostración** (p. ej. cuentas de prueba en US vía `STRIPE_CONNECT_ACCOUNT_COUNTRY`), aceptando que producción en Perú requiere hablar con ventas de Stripe. Mantiene el diseño de destination charges.
- (b) Global Payouts: cobrar en la plataforma (US/UK) y pagar después al organizador por separado. Separa cobro de pago; cambia 07/08 y el significado de "onboarding", y exige licencias/cumplimiento propios.
- (c) Otro procesador con presencia en Perú.
- **Recomendación:** (a) para esta spec, con `payment` detrás de `ConnectGateway`, y abrir en paralelo la consulta a ventas de Stripe **antes de salir a producción**; no construir (b) ni (c) hasta tener la respuesta. Si la respuesta de Stripe es negativa, se reemplaza solo el gateway (ver tabla "Qué sirve"). Aprobar esta spec implica aceptar (a) como alcance de la fase 1.

**#2 Webhook: `account.updated` (v1) vs thin events v2.** La tarjeta dice `account.updated`; las cuentas v2 emiten *thin events* y no ese evento. Según `SETUP.md` manda la spec; la discrepancia se reporta aquí.
- (a) Thin events v2 (`v2.core.account[configuration.recipient].capability_status_updated` y `v2.core.account[requirements].updated`), `parseEventNotification`, recuperar la cuenta, secreto propio.
- (b) Mantener `account.updated` snapshot: no se emite para cuentas v2, no sirve.
- **Recomendación:** (a), ruta `/api/webhooks/stripe-connect` y `STRIPE_CONNECT_WEBHOOK_SECRET` distinto de `STRIPE_WEBHOOK_SECRET`, que queda para el webhook de pagos (08, snapshot). Cambia: la ruta lee cuerpo crudo y usa el parser del SDK en lugar de `constructEvent`; hay que crear un *event destination* thin en Stripe (la configuración exacta del destino y el reenvío en local con la CLI se confirman en la implementación).

**#3 Aprobación del organizador.** Hoy no hay flujo `pending → approved`: `upsertOrganizer(..., "approved", ...)` en `user-sync-service.ts` y `setUserRole` crean/promueven organizadores ya `approved`, y `/admin/users` solo alterna `approved`/`suspended`. §5.6 describe `pending → Connect → approved`. Por eso, en la práctica, el gate real pasa a ser Connect.
- (a) No tocar el flujo (esta spec); el gate evalúa ambos y `pending` casi no ocurre.
- (b) Hacer que los organizadores nazcan `pending` y que el admin apruebe después de Connect `complete`.
- (c) Bloquear la aprobación del admin hasta que Connect esté `complete`.
- **Recomendación:** (a) ahora; decidir (b)/(c) en una spec de moderación de organizadores.

**#4 Validación del RUC.**
- (a) Solo 11 dígitos.
- (b) 11 dígitos + prefijo (`10|15|17|20`) + dígito verificador (offline, determinista).
- (c) (b) + consulta a SUNAT.
- **Recomendación:** (b), ya fijada en la spec; (c) es una integración externa que nadie pidió (YAGNI). Confirmar si hay RUC de personas naturales con prefijo `16` que deban aceptarse.

**#5 `business_name` y "perfil completo".** `organizer.business_name` ya es NOT NULL y se inicializa con el nombre o correo del usuario (`upsertOrganizer`), por lo que **no hace falta migración**; `tax_id` es nullable.
- (a) Perfil completo = `tax_id` guardado (el nombre ya existe, el formulario lo precarga y el organizador lo confirma).
- (b) Exigir además que el nombre haya sido editado (requiere una columna o bandera nueva: migración).
- **Recomendación:** (a). El `display_name` que se envía a Stripe puede ser un correo si el organizador no editó el nombre; el formulario lo deja visible.

**#6 Versión de API y SDK.** `stripe@23.0.0` fija `2026-09-30.endive` (breaking respecto de dahlia: sin `configurations` en Account Links v2; estado `rejected`).
- (a) Fijar `stripe` exacto en `23.0.0` y no sobreescribir `apiVersion` (los tipos del SDK están atados a esa versión).
- (b) Fijar una versión anterior (dahlia) y mantener `configurations`.
- **Recomendación:** (a). El developer debe confirmar nombres y firmas en los tipos del SDK instalado; si algo difiere de esta spec, lo reporta en "Bloqueos". Subir de versión más adelante requiere revisar el changelog (cambios *breaking* mensuales dentro de una release no ocurren, pero sí en el salto de release).

**#7 Onboarding hospedado (Account Link) vs embebido.**
- (a) Account Link hospedado por Stripe: menos código y menos superficie de seguridad.
- (b) Embebido (Connect embedded components): marca propia y `notification_banner`, más código y sesión de cuenta.
- **Recomendación:** (a) en fase 1; (b) cuando se quiera un panel de pagos dentro del dashboard (de ahí que `notification_banner` quede en "Próximas fases").

**#8 Eventos ya publicados si Connect deja de estar `complete`.**
- (a) No hacer nada automático: se mantienen publicados, se muestra el aviso en el dashboard y el checkout (07) fallará con un mensaje claro si la cuenta no puede recibir transferencias.
- (b) Auto-despublicar los eventos sin ventas.
- (c) Bloquear también edición/despublicación (descartado: deja al organizador sin control).
- **Recomendación:** (a) en esta spec (el gate solo aplica a la transición a `published`, ya reflejado en AC13); definir (b) junto con la tarjeta 07, que es quien sabe qué pasa con una compra en curso.

**#9 País y moneda de la cuenta conectada.** `identity.country` es obligatorio al crear la cuenta v2 y `defaults.currency` fija la moneda de liquidación; la app cobra en PEN. En test (opción #1-a) la cuenta tendría el país de la plataforma y otra moneda, lo que introduce conversión en los destination charges (tarjeta 07).
- (a) Variables `STRIPE_CONNECT_ACCOUNT_COUNTRY` / `STRIPE_CONNECT_ACCOUNT_CURRENCY`, sin valor por defecto en código (falla claro si faltan).
- (b) Constantes en código (`pe`/`pen`): hoy probablemente rechazadas por Stripe.
- **Recomendación:** (a); en test, el país de la plataforma. Revisar la conversión de moneda al llegar a la tarjeta 07.

**#10 Estados de `stripe_onboarding_status`.** El enum (`not_started | pending | complete`) alcanza para el gate. Pero `pending` también absorbe `restricted`, `unsupported` y `rejected`: un organizador con cuenta rechazada vería "Continuar onboarding" sin salida.
- (a) Mantener 3 estados (esta spec; sin migración de enum), registrar `rejected` en logs.
- (b) Agregar `restricted` y/o `rejected` al enum (`ALTER TYPE ... ADD VALUE`, migración en T0) y mostrar "Contacta a soporte" en la UI.
- **Recomendación:** (a) hasta que soporte reporte el caso; (b) es un cambio aditivo y barato cuando haga falta.

**#11 Sincronizar también al volver (`return_url`).** La tarjeta dice "vía webhook". El webhook es la fuente de verdad, pero el usuario vuelve antes de que llegue el evento y en local puede no haber reenvío.
- (a) Webhook + una sincronización puntual al volver (AC10).
- (b) Solo webhook; el estado puede verse desactualizado unos segundos.
- **Recomendación:** (a); la sincronización es idempotente y de solo lectura contra Stripe.

**#12 Unicidad.** El índice único en `stripe_account_id` (T0) no figura en `erd.md §5`. Tampoco se impone unicidad a `tax_id` (un mismo RUC puede tener varios usuarios de una empresa).
- Recomendación: índice único en `stripe_account_id` sí; unicidad de RUC no por ahora. Es una divergencia menor con el ERD, que se reporta aquí (los docs de arquitectura no se modifican).

**#13 Dependencia con la tarea 05.** `event-write-service.ts` (T3) tiene cambios sin commitear de `reservation-hold`, y ambas podrían generar migraciones en `drizzle/`. Recomendación: implementar T3 y T0 después de que 05 esté en main; T1 y T2 no tocan archivos de 05 y pueden empezar antes.

**#14 Organizadores del seed y de desarrollo.** Los organizadores existentes quedan en `not_started` y no podrán publicar nuevos borradores hasta completar el onboarding de prueba; los eventos ya publicados del seed no cambian. Confirmar que es aceptable o si el seed debe dejar un organizador con Connect `complete` (cambio en `src/db/seed*.ts`, fuera de esta spec).

## Próximas fases

- Tarjeta 07: PaymentIntent con `transfer_data.destination = organizer.stripe_account_id` y `application_fee_amount` (revisar #1 y #9 antes).
- Tarjeta 08: webhook de pagos `/api/webhooks/stripe` (snapshot, `STRIPE_WEBHOOK_SECRET`), reutilizando `stripe-event-service.ts`.
- Onboarding embebido, `notification_banner` y panel de pagos dentro del dashboard (#7).
- Estados `restricted`/`rejected` en el enum y UI de soporte (#10).
- Política para eventos publicados con Connect caído (#8) y reconciliación de cuentas huérfanas (cuenta creada en Stripe sin `stripe_account_id` guardado; la idempotency key la cubre solo por 24 h).
- Moderación de organizadores `pending → approved` coordinada con Connect (#3).
- Entrada de Configuración visible para admins/“crear organizador en nombre de” si hace falta.
