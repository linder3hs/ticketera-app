# Auth, roles y seed

Cómo se conecta Clerk con la DB. Diseño de roles en `docs/architecture/system-design.md` §3.

## Flujo

- **La DB es la fuente de verdad del rol** (`user.role`). Cada cambio de rol se refleja en `publicMetadata.role` de Clerk (lo lee `src/proxy.ts`).
- **Sync Clerk → DB** (`src/modules/user/services/user-sync-service.ts`): webhook `POST /api/webhooks/clerk` (`user.created|updated|deleted`) y fallback perezoso en el primer acceso autenticado (`getCurrentUser`). Nunca pisa el rol de un usuario existente.
- **Super admin**: el correo de `SUPER_ADMIN_EMAIL` (verificado en Clerk) nace/se promueve a `super_admin`. Es el único rol que no se asigna desde la app.
- **Crear admins/organizadores**: `/admin/users`. Si el correo ya tiene cuenta se cambia el rol; si no, se envía una invitación de Clerk con el rol en `publicMetadata` (lo fija el servidor) y el usuario lo recibe al registrarse.
- **Permisos**: `src/modules/user/user.permissions.ts` (`can`, `hasRole`, `canAssignRole`). `super_admin` gestiona admins; `admin` gestiona organizadores y clientes (aprobar/suspender organizadores). Quitar el rol de organizador lo suspende.
- **Guardas**: `proxy.ts` (sesión + chequeo grueso por claim), layouts `/admin` y `/organizer` y server actions (`requireRole`, contra la DB).

## Configuración en el dashboard de Clerk

1. **Sessions → Customize session token**: `{ "metadata": "{{user.public_metadata}}" }` (sin esto el chequeo por claim de `proxy.ts` se omite; las guardas de DB siguen activas).
2. **Webhooks**: endpoint `/api/webhooks/clerk` con `user.created`, `user.updated`, `user.deleted`; el Signing Secret va en `CLERK_WEBHOOK_SIGNING_SECRET`. En local hace falta un túnel (ngrok); sin él funciona el fallback perezoso.
3. **Invitaciones** habilitadas (Restrictions) para el flujo de "Invitar". El correo lleva a `{APP_URL}/sign-up` (variable `APP_URL`, ej. `http://localhost:3000`), donde `<SignUp />` consume el ticket de la invitación. Si una invitación ya enviada apunta a la web de Clerk, hay que revocarla en Users → Invitations y reenviarla (con `ignoreExisting` no se recrea).
4. **Paths** (Configure → Developers → Paths): sign-in y sign-up como "Application paths" (`/sign-in`, `/sign-up`) y Home URL de la app, para que ninguna redirección termine en el Account Portal de Clerk.

## Seed de eventos

`npm run db:seed -- organizer@correo.com` (o `SEED_ORGANIZER_EMAIL`) crea categorías, recintos (zonas y asientos) y los 10 eventos del mock publicados a nombre de ese organizador, con zonas, precios y asientos ya vendidos. Es idempotente. El usuario debe existir con rol `organizer` (asignarlo antes en `/admin/users`).
