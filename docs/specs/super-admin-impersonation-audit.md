# Impersonación de usuarios por el super admin y log de auditoría

Estado: aprobada

## Objetivo

1. El super admin puede **impersonar** (ver y actuar como) a un organizador o cliente desde `/admin/users`. El motivo es completar rápido el onboarding de Stripe Connect de los organizadores (guardar RUC, "Configurar pagos" y las páginas hosted de Stripe).
2. **Todo lo que hace el super admin queda en una tabla `audit_log`** de la base de datos: acción y fecha/hora con segundos. Cada fila se atribuye siempre al super admin **real**, también cuando actúa como otro usuario.

Roles, autorización y sesión: `system-design.md §3` (Roles y autorización, Reglas de límite) y `§5.5`. Reglas de rol en `src/modules/user/user.permissions.ts`; resolución del usuario de la sesión en `src/modules/user/current-user.ts:16-27`. Onboarding de Connect: `docs/specs/organizer-stripe-connect.md`.

### Decisiones fijadas (no se re-discuten)

- **D1. Mecanismo**: override a nivel app con una cookie. No se usan los actor tokens de Clerk (ver "No incluye").
- **D2. Diseño mínimo seguro**:
  - La cookie `impersonate_user_id` es httpOnly, `sameSite=lax`, `path=/`, `secure` en producción y `maxAge` = 8 h. Su valor es el `user.id` (uuid) del objetivo. Las 8 h existen porque el `return_url` de Stripe vuelve a `/organizer/settings?connect=return` y la cookie tiene que seguir viva. No lleva HMAC ni tabla de sesiones: el override se re-valida **en cada request** contra el usuario real de Clerk (`findUserByClerkId(auth().userId)`), que tiene que ser `super_admin`. Si un no-super-admin falsifica la cookie, no obtiene nada.
  - Hay un resolver nuevo, cacheado por request: `getImpersonation(): Promise<{ real: UserRecord; target: UserRecord } | null>` en `current-user.ts`. `getCurrentUser()` pasa a devolver `ctx?.target ?? real`. `requireRole` y todos los consumidores siguen igual (`getCurrentUser` es el único consumidor server de `auth()` en `src`: `current-user.ts:17,33`).
  - Una cookie con un valor que no es uuid, o que apunta a un usuario inexistente, borrado (`deletedAt`) o que ya no es un objetivo válido, se ignora y el resolver devuelve el usuario real. Nunca lanza.
  - Objetivo válido = `canImpersonate(actor, target)`, una función pura nueva: el actor es `super_admin`, el objetivo tiene rol `organizer` o `customer`, no es uno mismo y no está borrado. `canManageUser` (`user.permissions.ts:52-54`) no sirve, porque deja al super admin actuar sobre admins.
  - La acción de inicio usa `requireRole("super_admin")`. Eso bloquea solo la impersonación anidada, porque mientras impersona el usuario efectivo es el objetivo. La acción de salida lee el actor real con `getImpersonation()`, no con `requireRole`. Ambas viven en el archivo nuevo `src/modules/user/impersonation-actions.ts`. Al iniciar se redirige a `/organizer` si el objetivo es organizer y a `/` si es customer. Al salir se borra la cookie y se redirige a `/admin/users`.
  - `src/proxy.ts` no se toca. Ve los claims reales del admin (`super_admin` pasa todas las áreas), y los `requireRole` de layouts y acciones trabajan sobre el usuario efectivo.
- **D3. Tabla `audit_log`** (append-only), atribuida al actor real.
  - Para el registro se toma `getImpersonation()?.real ?? getCurrentUser()`. Solo se escribe si ese usuario es `super_admin`.
  - `actor_user_id` guarda el usuario real y `on_behalf_of_user_id` el objetivo (o `null`).
  - `created_at` es `timestamp with time zone` (timestamptz), igual que todos los timestamps del repo (`src/db/schema/columns.ts:5-12`). Es el "TIMESTAMP" pedido con zona horaria: guarda segundos (y microsegundos) y representa un instante sin ambigüedad.
- **D4. Puntos de auditoría**: los 3 wrappers `run()` más las acciones standalone de la tabla de abajo, incluidas las de cliente, porque el super admin puede impersonar clientes y se pidió "todo".
- **D5. UI**:
  - Botón "Impersonar" en `RowActions` de `UsersTable.tsx`, con confirmación en un `AlertDialog`.
  - Banner servidor "Estás viendo como … — Salir" montado en `src/app/(admin)/layout.tsx` y en `src/components/SiteHeader.tsx`. No va en `src/app/layout.tsx`.

## Alcance

- Incluye:
  - Tabla `audit_log` y su migración `0008`.
  - Módulo `src/modules/audit`: tipos, data-service con Drizzle y `recordAudit`.
  - Override de sesión por cookie: `getImpersonation`, `canImpersonate` y lógica pura en `user.impersonation.ts`.
  - Acciones `startImpersonationAction` y `stopImpersonationAction`. También quedan auditadas.
  - `recordAudit` cableado en todas las mutaciones de la tabla "Inventario de auditoría".
  - Botón y diálogo "Impersonar" en `/admin/users` (desktop y móvil).
  - Banner de impersonación con "Salir" en el panel (`/admin/*`, `/organizer/*`) y en todas las páginas que usan `SiteHeader`. Con eso `/refund-policy` deja de ser estática (ver Preguntas abiertas).
- No incluye:
  - **Actor tokens / impersonación nativa de Clerk**, por tres razones:
    - El plan free permite unas 5 impersonaciones al mes (ilimitado cuesta $100/mes con el add-on Administration).
    - La sesión impersonada muere tras 10 min de inactividad, y el admin pasa más tiempo en las páginas hosted de Stripe.
    - En modo single-session, consumir el ticket destruye la sesión propia del admin.
  - **HMAC o tabla de sesiones de impersonación**: re-validar al actor real en cada request ya basta; la cookie sola no otorga nada.
  - **Montar el banner en `src/app/layout.tsx`**: volvería dinámicas todas las rutas.
  - **`useAuth().actor` de Clerk** para el banner: solo existe con impersonación nativa.
  - Cambios en `src/proxy.ts` y en `Navbar.tsx`. Limitación conocida: el avatar de Clerk del `Navbar` (`Navbar.tsx:33`) sigue mostrando al super admin. El banner es lo que deja claro como quién se está actuando.
  - Bloquear acciones destructivas mientras se impersona (cancelar evento, borrar, editar perfil). No se bloquean, quedan auditadas (ver Preguntas abiertas).
  - Auditar lecturas (`listUsersPage`, `getAdminMetrics`, `listEventsAction`, `getMyOrderAction`), exports PDF/Excel (corren 100% en el navegador: `admin-export.ts:21,28`, `ExportButtons.tsx:26`) y webhooks (no tienen actor humano). Van en Próximas fases.
  - Vista UI del log, retención o purga, y extender el log al rol `admin`.
  - `update`/`delete` sobre `audit_log`: el código nunca los hace.
  - Toast/sonner ni `dropdown-menu`: no existen en `src/components/ui` y no se agregan.
  - Relaciones inversas en `userRelations`: nadie lee el log en esta fase.

## Reutilizar

- `findUserByClerkId`, `findUserById` y `UserRecord` de `src/modules/user/services/user-service.ts:22`. `findUserById` devuelve también usuarios borrados, así que el filtro de `deletedAt` va en `canImpersonate`.
- `getCurrentUser` y `requireRole` (`current-user.ts`): se reestructuran sin cambiar su firma. `hasRole` (`user.permissions.ts:28`).
- `ActionResult` (`user.types.ts:20`). Patrón de acción: `"use server"`, `schema.safeParse`, devuelve `ActionResult`, `revalidatePath`.
- Patrón de `cookies()` de Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`):
  - Es async.
  - Solo se escribe y borra en Server Functions y Route Handlers.
  - Leerla en un layout o página vuelve dinámica la ruta.
- Helper `id` de `src/db/schema/columns.ts:3` y la convención de timestamps de `columns.ts:5-12`. Barrel `src/db/schema/index.ts` y `src/db/schema/relations.ts`.
- Patrón "registrar sin romper" de `logMiss` en `src/modules/check-in/services/check-in-service.ts:117-131` (try/catch + `console.error`).
- Patrón de tests que mockean el data-service y nunca `@/db` (`refund-service.test.ts:22`, `order-service.test.ts:7`).
- `DeleteUserDialog.tsx:27-72`: `AlertDialog`, `useTransition` y un `Button` normal para que el error se muestre dentro del diálogo.
- Aviso `setNotice` de `UsersAdmin.tsx:65-86`. `actor` ya llega a `UsersTable` (`admin/users/page.tsx:13-17` → `UsersAdmin.tsx:19,25` → `UsersTable.tsx:91-100`).
- shadcn ya instalado: `alert-dialog`, `button`. No hace falta `npx shadcn add`.

## Archivos

Nuevos:

- `src/db/schema/audit.ts`: tabla `auditLog` (`audit_log`).
- `drizzle/0008_*.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json`. Los genera `npm run db:generate`; no se escriben a mano.
- `src/modules/audit/audit.types.ts`: `AuditEntry` (la entrada de `recordAudit`) y `NewAuditLog` (la fila a insertar).
- `src/modules/audit/services/audit-log-data-service.ts`: `insertAuditLog(row)`, solo Drizzle.
- `src/modules/audit/services/audit-log-service.ts` + `audit-log-service.test.ts`: `recordAudit`.
- `src/modules/user/user.impersonation.ts` + `user.impersonation.test.ts`: constantes de la cookie, `parseImpersonationTargetId` y `resolveImpersonation`.
- `src/modules/user/impersonation-actions.ts`: `startImpersonationAction` y `stopImpersonationAction`.
- `src/modules/user/components/ImpersonateUserDialog.tsx`, `ImpersonationBanner.tsx` (server) y `StopImpersonationButton.tsx` (client).

Modificados:

- `src/db/schema/index.ts` y `src/db/schema/relations.ts`.
- `src/modules/user/current-user.ts`, `user.permissions.ts` + test, `user.schema.ts` + test.
- Acciones: `src/modules/{user,event,venue,payment,organizer,check-in,booking,favorite}/actions.ts` y `src/app/(admin)/organizer/settings/connect/refresh/route.ts`.
- UI: `src/modules/user/components/UsersTable.tsx`, `UsersAdmin.tsx`, `src/app/(admin)/layout.tsx`, `src/components/SiteHeader.tsx`.

### Tabla `audit_log` (T0)

| Columna                | Tipo                                                                     | Nota                            |
| ---------------------- | ------------------------------------------------------------------------ | ------------------------------- |
| `id`                   | uuid PK `defaultRandom()`                                                | helper `id`                     |
| `actor_user_id`        | uuid NOT NULL, FK `user.id`                                              | super admin **real**            |
| `on_behalf_of_user_id` | uuid NULL, FK `user.id`                                                  | usuario impersonado             |
| `action`               | text NOT NULL                                                            | `<dominio>.<verbo_snake>`       |
| `target_type`          | text NULL                                                                | p. ej. `user`, `event`, `venue` |
| `target_id`            | text NULL                                                                | id o código del recurso         |
| `metadata`             | jsonb NULL                                                               | input parseado sin secretos     |
| `created_at`           | `timestamp("created_at", { withTimezone: true }).defaultNow().notNull()` | sin `updated_at` (append-only)  |

- Índices: `audit_log_actor_created_idx (actor_user_id, created_at)` y `audit_log_created_idx (created_at)`.
- FK simple sin `onDelete`: los usuarios se borran de forma lógica.
- En `relations.ts` solo se agrega `auditLogRelations`, con dos `one(user, …)` desambiguadas con `relationName` (`audit_actor` y `audit_on_behalf_of`). `userRelations` no se toca.

### Contrato `recordAudit` (T1; T2 y T3 programan contra él en paralelo)

```ts
// src/modules/audit/services/audit-log-service.ts
export async function recordAudit(entry: {
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void>;
```

- Resuelve el actor internamente: `ctx = await getImpersonation()` y `actor = ctx?.real ?? await getCurrentUser()`.
- Si `actor` es `null` o su rol no es `super_admin`, no hace nada (no-op).
- Si aplica, inserta `actorUserId = actor.id`, `onBehalfOfUserId = ctx?.target.id ?? null` y los campos de la entrada.
- **Nunca lanza**: todo va en try/catch y los errores van a `console.error`.
- Se llama **después** de una mutación con `result.ok === true` y antes del `return`/`redirect`.
- Importa de `current-user.ts`. `current-user.ts` no importa nada de `audit`, para evitar un ciclo.

### Contrato de impersonación (T2; T4 lo consume)

- `user.impersonation.ts`:
  - `IMPERSONATION_COOKIE = "impersonate_user_id"` e `IMPERSONATION_MAX_AGE_SECONDS = 8 * 60 * 60`.
  - `parseImpersonationTargetId(value: string | undefined): string | null`: devuelve el uuid válido o `null`.
  - `resolveImpersonation(real, target | undefined)`: devuelve `{ real, target }` solo si `canImpersonate(real, target)`; si no, `null`.
- `user.permissions.ts`: `canImpersonate(actor: { id: string; role: Role }, target: { id: string; role: Role; deletedAt?: Date | null }): boolean`. `deletedAt` es opcional porque `UserRow` no lo trae (la lista ya filtra borrados).
- `current-user.ts`:
  - La lógica actual pasa a un resolver interno cacheado del usuario de la sesión (real).
  - `getImpersonation = cache(...)` lee la cookie y hace la consulta solo si el real es `super_admin`. Para usuarios normales no hay consulta extra.
  - `getCurrentUser = cache(async () => (await getImpersonation())?.target ?? real)`.
  - Se exporta `getImpersonation`. `requireRole` no cambia.
- `user.schema.ts`: `impersonateUserSchema = z.object({ userId: z.uuid() })`.
- `impersonation-actions.ts` (`"use server"`):
  - `startImpersonationAction(input: unknown): Promise<ActionResult>`. En éxito redirige; solo devuelve si hay error.
  - `stopImpersonationAction(): Promise<void>`: siempre redirige a `/admin/users`.
  - Orden en start:
    1. `requireRole("super_admin")`.
    2. Parse.
    3. `findUserById`.
    4. `canImpersonate`.
    5. Setear la cookie.
    6. `recordAudit({ action: "impersonation.start", targetType: "user", targetId })`.
    7. `redirect`.
  - Orden en stop:
    1. `getImpersonation()`.
    2. Si hay impersonación activa, `recordAudit({ action: "impersonation.stop", targetType: "user", targetId: target.id })`. Va **antes** de borrar la cookie.
    3. Borrar la cookie.
    4. `redirect("/admin/users")`.

### Inventario de auditoría (T3)

Cada acción registra una fila tras `ok: true`. Los ids salen de `parsed.data` o del resultado si el recurso es nuevo.

| Archivo                    | Acción                         | `action`                             | `target_type` / `target_id`          | `metadata`                                          |
| -------------------------- | ------------------------------ | ------------------------------------ | ------------------------------------ | --------------------------------------------------- |
| `user/actions.ts`          | `inviteStaffAction`            | `user.invite`                        | `user` / —                           | `{ email, role }`                                   |
|                            | `changeRoleAction`             | `user.change_role`                   | `user` / `userId`                    | `{ role }`                                          |
|                            | `changeOrganizerStatusAction`  | `user.change_organizer_status`       | `user` / `userId`                    | `{ status }`                                        |
|                            | `updateUserAction`             | `user.update`                        | `user` / `userId`                    | `{ role, status }`                                  |
|                            | `deleteUserAction`             | `user.delete`                        | `user` / `userId`                    | —                                                   |
| `event/actions.ts`         | `createEventAction`            | `event.create`                       | `event` / `data.id`                  | `{ organizerId }` si viene                          |
|                            | `updateEventAction`            | `event.update`                       | `event` / `id`                       | —                                                   |
|                            | `deleteEventAction`            | `event.delete`                       | `event` / `id`                       | —                                                   |
|                            | `setEventStatusAction`         | `event.set_status`                   | `event` / `id`                       | `{ status }`                                        |
|                            | `retryEventRefundsAction`      | `event.retry_refunds`                | `event` / `id`                       | —                                                   |
|                            | `setEventFeaturedAction`       | `event.set_featured`                 | `event` / `id`                       | `{ featured }`                                      |
|                            | `createCoverUploadAction`      | `event.create_cover_upload`          | —                                    | `{ contentType }`                                   |
| `venue/actions.ts`         | `createVenueAction`            | `venue.create`                       | `venue` / `data.id`                  | —                                                   |
|                            | `updateVenueAction`            | `venue.update`                       | `venue` / `id`                       | —                                                   |
|                            | `deleteVenueAction`            | `venue.delete`                       | `venue` / `id`                       | —                                                   |
|                            | `createZoneAction`             | `venue.create_zone`                  | `venue_zone` / `data.id`             | `{ venueId }`                                       |
|                            | `updateZoneAction`             | `venue.update_zone`                  | `venue_zone` / `id`                  | —                                                   |
|                            | `deleteZoneAction`             | `venue.delete_zone`                  | `venue_zone` / `id`                  | —                                                   |
|                            | `generateSeatsAction`          | `venue.generate_seats`               | `venue_zone` / `zoneId`              | `{ count }`                                         |
| `payment/actions.ts`       | `updatePlatformFeeAction`      | `payment.update_platform_fee`        | `platform_setting` / —               | `{ percent }`                                       |
|                            | `startConnectOnboardingAction` | `payment.start_connect_onboarding`   | —                                    | — (**nunca** la `url`)                              |
| `connect/refresh/route.ts` | `GET`                          | `payment.refresh_connect_onboarding` | —                                    | — (**nunca** la `url`)                              |
| `organizer/actions.ts`     | `updateOrganizerProfileAction` | `organizer.update_profile`           | —                                    | `{ businessName, taxId }`                           |
| `check-in/actions.ts`      | `checkInTicketAction`          | `check_in.scan`                      | `event` / `eventId`                  | `{ result: data.result }` (sin el código escaneado) |
| `booking/actions.ts`       | `reserveTicketsAction`         | `booking.reserve`                    | `reservation` / `data.reservationId` | `{ slug }`                                          |
|                            | `startCheckoutAction`          | `booking.start_checkout`             | `order` / `data.orderCode`           | `{ slug }` (sin `payment` ni datos del comprador)   |
| `favorite/actions.ts`      | `setEventFavoriteAction`       | `favorite.set`                       | `event` / `eventId`                  | `{ favorite }`                                      |

- `user/actions.ts`: `run()` (`:26-31`) pasa a recibir el nombre de la acción y un descriptor de auditoría.
- `event/actions.ts` (`:53-69`) y `venue/actions.ts` (`:36-53`): sus `run()` ya reciben `name` y suman el descriptor.
- La forma exacta del descriptor la decide el developer: un objeto, o una función del resultado para los ids creados.

## Criterios de aceptación

- AC1 (tabla): `npm run db:migrate` sobre una base en `0007` crea `audit_log` con exactamente las columnas, FKs e índices de la tabla de arriba. `drizzle/0008_*.sql`, el snapshot y `_journal.json` (idx 8) salen de `npm run db:generate`. `created_at` es `timestamptz` con `default now()`. `select to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') from audit_log` muestra horas, minutos y segundos.
- AC2 (`canImpersonate`): devuelve `true` solo con actor `super_admin` y objetivo `organizer` o `customer` no borrado y distinto del actor. Devuelve `false` si el objetivo es `admin`, `super_admin`, uno mismo o tiene `deletedAt`, y `false` para cualquier actor `admin`, `organizer` o `customer`.
- AC3 (inicio): el super admin confirma sobre un objetivo válido.
  - Se crea la cookie `impersonate_user_id` (httpOnly, `sameSite=lax`, `path=/`, `secure` en producción, `maxAge` 28800) con el uuid del objetivo.
  - Se inserta una fila `impersonation.start`: `actor_user_id` = super admin, `target_type='user'`, `target_id` = objetivo.
  - Redirige a `/organizer` (objetivo organizer) o a `/` (objetivo customer).
  - Con un objetivo inválido (admin, super_admin, uno mismo, borrado, inexistente o uuid mal formado) devuelve `{ ok: false, error }`, sin cookie y sin fila.
- AC4 (no-super-admin no inicia): si `admin`, `organizer` o `customer` llaman `startImpersonationAction`, `requireRole("super_admin")` los redirige a `/`. No se escribe cookie ni fila.
- AC5 (usuario efectivo): con la impersonación activa, `getCurrentUser()` y `requireRole()` devuelven el objetivo en todo el servidor.
  - El panel (`PanelShell`) muestra el nombre, el rol y el menú del objetivo.
  - `/organizer/settings` muestra el estado de Connect del objetivo.
  - `/my-tickets` muestra las entradas del objetivo customer.
  - `/admin/users` redirige a `/` hasta salir.
- AC6 (cookie falsificada o inválida): el usuario efectivo no cambia en ninguno de estos casos:
  - Un usuario `admin`, `organizer` o `customer` con la cookie puesta a mano, aunque sea el uuid válido de otro usuario: `getCurrentUser()` devuelve su propio usuario y `getImpersonation()` devuelve `null`.
  - El super admin con una cookie no uuid, inexistente, de un usuario borrado, de un admin o de sí mismo: `getCurrentUser()` devuelve al super admin.
  - En ninguno de los casos se lanza una excepción.
- AC7 (sin anidar): con la impersonación activa, llamar `startImpersonationAction` redirige a `/` (el usuario efectivo es el objetivo) y la cookie no cambia.
- AC8 (salida):
  - Con impersonación activa, "Salir" inserta `impersonation.stop` (`actor_user_id` = super admin, `on_behalf_of_user_id` = objetivo, `target_id` = objetivo), borra la cookie y redirige a `/admin/users`. En el siguiente request `getCurrentUser()` vuelve a ser el super admin.
  - Sin impersonación activa no inserta fila ni falla: borra la cookie si existe y redirige.
- AC9 (atribución en Connect, crítico):
  - Con el super admin impersonando a un organizador, `startConnectOnboardingAction` con resultado `ok` genera el link para el organizador (`findOrganizerByUserId(target.id)`, `connect-service.ts:33`).
  - Inserta `payment.start_connect_onboarding` con `actor_user_id` = super admin real y `on_behalf_of_user_id` = organizador. La fila nunca se atribuye solo al organizador ni se omite.
  - Lo mismo vale para `GET /organizer/settings/connect/refresh` (`payment.refresh_connect_onboarding`) y para `updateOrganizerProfileAction` (`organizer.update_profile`).
  - Ida y vuelta a Stripe: tras completar o abandonar las páginas hosted y volver por navegación top-level a `/organizer/settings?connect=return` o a `/organizer/settings/connect/refresh`, la impersonación sigue activa (cookie `sameSite=lax`, `maxAge` 8 h). Se ve el banner y el estado de Connect que se muestra es el del organizador.
- AC10 (filtro super admin):
  - Una acción del inventario hecha por un `admin`, `organizer` o `customer` sin impersonación no inserta filas.
  - La misma acción hecha por el super admin sin impersonar inserta una fila con `on_behalf_of_user_id = null`.
- AC11 (inventario completo):
  - Cada acción de la tabla "Inventario de auditoría" inserta exactamente una fila con su `action`, `target_type`, `target_id` y `metadata`, y solo con `result.ok === true`.
  - Una validación fallida, una autorización denegada o un `ok: false` no insertan filas.
  - Las lecturas (`listEventsAction`, `getMyOrderAction`) no se registran.
- AC12 (nunca rompe): si el insert del log falla (p. ej. la DB rechaza la fila), `recordAudit` lo registra con `console.error`. La acción devuelve el mismo resultado que sin auditoría y la mutación no se revierte.
- AC13 (sin secretos ni escrituras):
  - `metadata` nunca contiene URLs de Stripe, `client_secret` ni el objeto `payment`, el código de ticket escaneado, ni el documento o teléfono del comprador.
  - Ningún archivo hace `update` ni `delete` sobre `auditLog` (verificable con grep).
- AC14 (botón y diálogo):
  - En `/admin/users`, el botón "Impersonar" aparece en la tabla de desktop y en las tarjetas móviles solo en las filas donde `canImpersonate(actor, row)`. Un `admin` nunca lo ve.
  - El botón tiene `aria-label` con el nombre o correo del usuario y un target de al menos 44 px.
  - Abre un `AlertDialog` con el nombre o correo y un aviso: "Todo lo que hagas quedará registrado a tu nombre".
  - Al confirmar se ejecuta el inicio. Un error del servidor se muestra dentro del diálogo, sin cerrarlo.
- AC15 (banner):
  - Con la impersonación activa, arriba de `/admin/*`, `/organizer/*` y de toda página con `SiteHeader` (`/`, `/events`, `/events/[slug]`, `/favorites`, `/my-tickets`, `/refund-policy`) se ve "Estás viendo como <nombre o correo> — Salir".
  - Sin impersonación el banner no renderiza nada.
  - "Salir" cumple AC8 y el banner desaparece.
- AC16 (sin tocar): `src/proxy.ts`, `Navbar.tsx` y `src/app/layout.tsx` no cambian.
- AC17: `npm run lint`, `npx vitest run` y `npm run build` pasan.

## Tests requeridos

(Vitest, junto al archivo; sin DB, siguiendo el precedente del repo)

- `src/modules/user/user.permissions.test.ts`, nuevo bloque `canImpersonate`: super_admin → organizer y customer `true`; super_admin → admin, super_admin, a sí mismo y a un usuario borrado `false`; actor admin, organizer y customer `false` (AC2).
- `src/modules/user/user.impersonation.test.ts`:
  - `parseImpersonationTargetId`: `undefined`, `""` y no-uuid → `null`; uuid → el uuid.
  - `resolveImpersonation`: real no super admin con objetivo válido (cookie falsificada) → `null`; objetivo `undefined`, admin, propio o borrado → `null`; caso válido → `{ real, target }` (AC6).
- `src/modules/user/user.schema.test.ts`: `impersonateUserSchema` (uuid válido e inválido) (AC3).
- `src/modules/audit/services/audit-log-service.test.ts`:
  - Mocks: `vi.mock("@/modules/user/current-user")` y `vi.mock("./audit-log-data-service")`. Es el primer service que depende de `current-user`, así que no se mockea Clerk, `next/*` ni `@/db`.
  - Casos:
    - (a) Super admin sin impersonar → `insertAuditLog` con su id y `onBehalfOfUserId: null`.
    - (b) Bajo impersonación `{ real: superAdmin, target: organizer }`, con la entrada `payment.start_connect_onboarding` → `actorUserId = real.id` y `onBehalfOfUserId = target.id` (AC9).
    - (c) Admin, organizer, customer o `null` → no inserta (AC10).
    - (d) `insertAuditLog` rechaza → `recordAudit` resuelve sin lanzar y llama `console.error` (AC12).
    - (e) `getCurrentUser` rechaza → no lanza.
- No llevan test (precedente: no existen `actions.test.ts`, y los data-services con DB y los componentes visuales no se testean): `audit-log-data-service.ts`, `current-user.ts` (su decisión vive en `resolveImpersonation`), las acciones y los componentes.

## Tareas

### T0 — Schema y migración de `audit_log`

- Archivos: `src/db/schema/audit.ts` (nuevo), `src/db/schema/index.ts`, `src/db/schema/relations.ts`, `drizzle/0008_*.sql`, `drizzle/meta/0008_snapshot.json`, `drizzle/meta/_journal.json`. Los de `drizzle/` salen de `npm run db:generate`; después se aplica `npm run db:migrate` en local. En AWS lo aplica `deploy/deploy.sh:34`.
- Depende de: —
- Paralelizable: no (base de T1 y T2)
- Cubre: AC1, AC13 (append-only en el schema: sin `updated_at`)

### T1 — Módulo `audit`

- Archivos: `src/modules/audit/audit.types.ts`, `src/modules/audit/services/audit-log-data-service.ts`, `src/modules/audit/services/audit-log-service.ts`, `src/modules/audit/services/audit-log-service.test.ts`
- Depende de: T0
- Paralelizable: sí, con T2. Programa contra la firma de `getImpersonation`/`getCurrentUser` fijada arriba.
- Cubre: AC9 (lógica de atribución), AC10, AC12, AC13

### T2 — Núcleo de impersonación

- Archivos: `src/modules/user/current-user.ts`, `src/modules/user/user.permissions.ts`, `src/modules/user/user.permissions.test.ts`, `src/modules/user/user.impersonation.ts` (nuevo), `src/modules/user/user.impersonation.test.ts` (nuevo), `src/modules/user/user.schema.ts`, `src/modules/user/user.schema.test.ts`, `src/modules/user/impersonation-actions.ts` (nuevo)
- Depende de: T0. Usa la firma fija de `recordAudit` de T1.
- Paralelizable: sí, con T1. Se programa en paralelo, pero `impersonation-actions.ts` importa `recordAudit`: lint y build se verifican después de integrar T0+T1+T2.
- Cubre: AC2, AC3, AC4, AC5, AC6, AC7, AC8

### T3 — Cableado de auditoría

- Archivos: `src/modules/user/actions.ts`, `src/modules/event/actions.ts`, `src/modules/venue/actions.ts`, `src/modules/payment/actions.ts`, `src/modules/organizer/actions.ts`, `src/modules/check-in/actions.ts`, `src/modules/booking/actions.ts`, `src/modules/favorite/actions.ts`, `src/app/(admin)/organizer/settings/connect/refresh/route.ts`
- Depende de: T1
- Paralelizable: sí, con T4 (no comparten archivos)
- Cubre: AC9, AC10, AC11, AC12, AC13

### T4 — UI: botón, diálogo y banner

- Archivos: `src/modules/user/components/UsersTable.tsx`, `src/modules/user/components/UsersAdmin.tsx`, `src/modules/user/components/ImpersonateUserDialog.tsx` (nuevo), `src/modules/user/components/ImpersonationBanner.tsx` (nuevo), `src/modules/user/components/StopImpersonationButton.tsx` (nuevo), `src/app/(admin)/layout.tsx`, `src/components/SiteHeader.tsx`
- Depende de: T2
- Paralelizable: sí, con T3
- Cubre: AC14, AC15, AC16, AC17 (integración)
- Notas:
  - En `UsersTable.tsx`, la prop nueva es `onImpersonate` (`:33-43`). `RowActions` (`:96-156`) se renderiza en desktop (`:202`) y en móvil (`:220`).
  - `ImpersonationBanner` es un server component asíncrono que llama `getImpersonation()` y devuelve `null` si no hay impersonación.
  - En `(admin)/layout.tsx` el banner va **encima** de `<PanelShell>`, no dentro: `PanelShell.tsx` es `"use client"` y no es de T4.
  - En `SiteHeader.tsx` el banner va dentro del `<header>`, antes de `<Navbar />`.
  - Si se necesita un aviso en la lista, se reutiliza `setNotice`. El éxito del inicio es la redirección.

## Preguntas abiertas

1. **Discrepancia con la arquitectura**: `docs/architecture/system-design.md:12` deja la auditoría (`audit_log`) fuera del alcance, y `erd.md` no tiene la tabla. Manda esta spec (SETUP.md §4). Los documentos de arquitectura no se modifican aquí; actualizarlos es decisión humana.
2. **Regla de límite** (`system-design.md §3`, "Los services no importan nada de `next/*`"): `audit-log-service.ts` importa `current-user.ts` (Clerk, `next/headers`, `next/navigation`) para resolver el actor (D3). Hoy ningún service importa `current-user`. Se mantiene por D3, y el test lo aísla con un mock. La alternativa sería que cada acción resuelva el actor y se lo pase a `recordAudit`, pero eso cambia la API fijada. ¿Se acepta la excepción?
3. **¿Impersonar también a customers?** Por defecto sí, porque el pedido dice "usuarios". Si solo hacen falta organizadores, se restringe `canImpersonate`.
4. **¿Extender el log al rol `admin`?** Por defecto no: solo el super admin, como se pidió.
5. **¿Bloquear `startCheckoutAction` (y `reserveTicketsAction`) mientras se impersona a un customer?** Por defecto no se bloquean: quedan auditadas y las reservas o pedidos quedan en la cuenta del cliente.
6. **`/refund-policy` pasa de estática a dinámica**: el banner en `SiteHeader` lee cookies. Según el último build local es la única ruta de app prerenderizada; el resto ya es dinámico. Por defecto se acepta.
7. **Duración y cierre de sesión**: la cookie dura 8 h y no se borra al cerrar la sesión de Clerk. Si otra persona no super admin inicia sesión en el mismo navegador, la cookie se ignora (AC6). Si vuelve a entrar el mismo super admin, la impersonación sigue activa y el banner lo muestra. ¿Se borra también en el sign-out? Por defecto no.
8. **Riesgos aceptados en fase 1**: mientras impersona, el super admin puede cancelar eventos (dispara reembolsos en Stripe), borrar eventos o venues, o sobrescribir la razón social y el RUC del perfil (`user-service.ts:160-170`). No se bloquea nada; todo queda auditado. En modo live de Stripe, los datos KYC de las páginas hosted tienen que ser los del organizador.
9. **Alternativa más simple que no se construye**: una acción "generar el link de Connect del organizador X" sin impersonar. Los services ya reciben el user id. No se hace porque se pidió impersonación.

## Próximas fases

- Vista "Auditoría" del log en el panel (sección Plataforma de `panel-nav.ts:21-25`, `minRole` super_admin), con filtros por actor, acción y fecha. Ahí entrarían las relaciones inversas en `userRelations`.
- Auditar lecturas sensibles (`listUsersPage`, `getAdminMetrics`) y los exports PDF/Excel. Estos necesitan una server action nueva porque hoy corren en el navegador.
- Extender el log al rol `admin` y definir la retención o purga del log.
- Bloquear o pedir confirmación extra para acciones destructivas mientras se impersona.
- Migrar a la impersonación nativa de Clerk (actor tokens) si cambia el plan.
