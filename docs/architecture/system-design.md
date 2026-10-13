# System Design — Ticketera

Estado: borrador (pendiente de revisión humana)
Fecha: 2026-09-30
Relacionado: [`erd.md`](./erd.md) (modelo de datos). El design system visual vive en [`../design/design-system.md`](../design/design-system.md) y no se modifica aquí.

## 1. Objetivo y alcance

Definir la arquitectura de Ticketera (venta de entradas con QR) y su modelo de datos, a partir de los 8 features del canvas de diseño.

**Dentro del alcance:** arquitectura, entornos, integraciones (Clerk con Google OAuth, Stripe Connect, Google Maps), roles, flujos críticos y MER.
**Fuera del alcance:** implementación, UI del mapa de asientos, Yape y PagoEfectivo, auditoría (`audit_log`) y newsletter.

## 2. Decisiones

| Tema                | Decisión                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Backend             | Monolito Next.js 16 (Route Handlers, Server Actions, `src/modules/*`)                         |
| Base de datos       | Postgres. Local: Neon. Prod: Cloud SQL (GCP)                                                  |
| ORM / migraciones   | Drizzle ORM + drizzle-kit                                                                     |
| Auth                | Clerk. Google OAuth (social connection) es el método principal; email/password es alternativo |
| Pagos               | Solo tarjeta vía Stripe, con Stripe Connect (comisión de plataforma y neto al organizador)    |
| Mapas               | Google Maps solo en prod; sin `GOOGLE_MAPS_API_KEY` la UI no muestra mapa                     |
| Inventario          | Zonas mixtas (`numbered` y `general_admission`) con reserva temporal de 10 min                |
| Organizador         | Perfil `organizer` 1:1 con `user`                                                             |
| Moneda / documentos | `PEN`; DNI, CE, pasaporte (según el canvas)                                                   |

## 3. Arquitectura

```
Browser ──► Next.js 16 (localhost en local / Cloud Run en prod)
             ├─ src/app: solo rutas (page, layout, route.ts)
             ├─ proxy.ts: Clerk + guard de roles por prefijo de ruta
             ├─ src/modules/<domain>: components, hooks, services, schema, types
             │    (auth, user, organizer, venue, event, inventory,
             │     order, payment, ticket, refund, check-in)
             ├─ src/db: cliente Drizzle + schema + migraciones
             └─ route.ts de webhooks: /api/webhooks/clerk, /api/webhooks/stripe

Externos: Clerk (identidad) ◄── Google OAuth (login social) · Stripe + Connect (pagos) · Google Maps (solo prod)
Datos:    Postgres (Neon local / Cloud SQL prod)
Jobs:     Cloud Scheduler → /api/jobs/release-holds
```

### Reglas de límite

- Los `services` no importan nada de `next/*`: se prueban con Vitest y pueden extraerse a una API después.
- Un `route.ts` o Server Action solo valida entrada (zod), autoriza el rol y llama a un service.
- Solo el módulo `payment` habla con Stripe. Solo `auth`/`user` hablan con Clerk. Google nunca se llama desde la app: el OAuth lo resuelve Clerk y la app solo recibe la sesión y los webhooks.
- `src/app` no contiene lógica de dominio (ver `docs/SETUP.md`).

### Roles y autorización

Jerarquía: `super_admin` > `admin` > `organizer` > `customer`.

| Rol           | Puede                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `super_admin` | Todo lo de `admin`; crear/quitar administradores; editar `platform_setting` (comisión y ajustes globales)                      |
| `admin`       | Moderar organizadores (aprobar/suspender) y eventos (incluye cancelar); gestionar usuarios y reembolsos; ver reportes globales |
| `organizer`   | Crear y publicar sus eventos, configurar zonas y precios, ver sus ventas, escanear check-in                                    |
| `customer`    | Buscar, comprar, ver sus entradas, pedir reembolso permitido                                                                   |

- `proxy.ts` hace el chequeo grueso por prefijo (`/admin`, `/organizer`, `/my-tickets`) leyendo el rol de `publicMetadata` de Clerk.
- El chequeo fino de propiedad (un organizador solo edita sus eventos) va en el service, contra la DB.
- **La DB es la fuente de verdad del rol.** Al cambiarlo, se refleja en `publicMetadata` de Clerk.
- Webhooks `user.created` y `user.updated` de Clerk hacen upsert de `user` (`clerk_id`, `email`, `full_name`, `avatar_url`, `auth_provider`). Si el webhook aún no llegó, el primer acceso autenticado crea el registro (fallback perezoso).
- Todo usuario nuevo nace como `customer`; ningún login (Google incluido) otorga roles elevados. Solo `super_admin`/`admin` cambian el rol.

## 4. Entornos

|                | Local                                             | Producción                                                                |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------- |
| Google OAuth   | Credenciales compartidas de Clerk (instancia dev) | Cliente OAuth propio en Google Cloud (Client ID/Secret cargados en Clerk) |
| Runtime        | `npm run dev` en localhost                        | Cloud Run                                                                 |
| Postgres       | Neon (driver serverless)                          | Cloud SQL (`pg` + conector de Cloud SQL)                                  |
| Secretos       | `.env.local`                                      | Secret Manager                                                            |
| Google Maps    | No se usa                                         | Se usa (`GOOGLE_MAPS_API_KEY`)                                            |
| Migraciones    | `drizzle-kit` manual                              | Job de drizzle-kit antes de cada deploy                                   |
| Stripe / Clerk | Claves de test                                    | Claves live                                                               |

El mismo código corre en ambos; solo cambian las variables (`DATABASE_URL`, claves de Clerk y Stripe, `GOOGLE_MAPS_API_KEY`). El Client ID/Secret de Google viven en el dashboard de Clerk, no en variables de la app; en prod la redirect URI autorizada en Google es la que entrega Clerk.

## 5. Flujos críticos

### 5.1 Compra

1. El cliente elige zona y cantidad (GA) o asientos (numbered) → `reservation` `active` con `expires_at = now + 10 min`; los asientos pasan a `held` y las zonas GA suben `held_count`.
2. Checkout: se crea `orders` `pending` con snapshot del comprador y un PaymentIntent de Stripe con `application_fee_amount` y `transfer_data.destination = organizer.stripe_account_id`.
3. Webhook `payment_intent.succeeded` (idempotente vía `stripe_event`): `orders.paid`, `reservation.converted`, `event_seat`→`sold` o `sold_count`+`n` con `held_count`−`n`, se emite un `ticket` por `order_item` con `code` único para el QR.
4. Pago fallido o reserva vencida: `orders.failed`/`cancelled` y se libera el inventario.

### 5.2 Liberación de reservas

Cloud Scheduler llama a `/api/jobs/release-holds` (autenticado). Marca `reservation` vencidas como `expired`, devuelve `event_seat` a `available` y baja `held_count`. Además, las lecturas de disponibilidad ignoran reservas vencidas, así que no dependen del job para ser correctas.

### 5.3 Check-in

El organizador escanea el QR. `UPDATE ticket SET status='used', checked_in_at=now() WHERE code=? AND status='valid'`. Se registra siempre un `check_in` con `result`: `ok`, `already_used`, `invalid` o `wrong_event`.

### 5.4 Cancelación de evento y reembolsos

- `event.status='cancelled'` crea un `refund` (`reason=event_cancelled`) por cada `payment` pagado y llama a Stripe; `ticket`→`refunded`.
- Reembolso a pedido: `refund` + `refund_ticket` por las entradas incluidas; `orders` pasa a `partially_refunded` o `refunded`.
- El estado final lo confirma el webhook de Stripe (`stripe_refund_id` único).

### 5.5 Login con Google

1. El usuario pulsa "Continuar con Google" en `/login` o `/register` → Clerk redirige a Google (OAuth) y vuelve con la sesión.
2. Clerk emite el webhook `user.created` (primer ingreso) o `user.updated`; `user` se upserta por `clerk_id` con `auth_provider='google'`, nombre y foto del perfil de Google.
3. Si ya existe una cuenta email/password con el mismo correo verificado por Google, Clerk las vincula al mismo `clerk_id`: no se duplica `user` (`email` es UQ).
4. Google no entrega teléfono ni documento: `phone`, `document_type` y `document_number` quedan en null y se piden en el checkout (se guardan en el snapshot del pedido y, opcionalmente, en `user`).
5. `proxy.ts` lee el rol de `publicMetadata`; el rol inicial es `customer`.

### 5.6 Onboarding de organizador

Alta de `organizer` (`pending`) → onboarding Stripe Connect (`stripe_onboarding_status`) → aprobación por `admin` (`approved`). Un organizador no puede publicar eventos hasta estar `approved` y con Connect completo.

## 6. Pendientes y supuestos

- **Mapa de asientos:** el canvas solo tiene mapa por zonas. La UI de asientos numerados es trabajo futuro; el modelo ya guarda geometría (`venue_zone.map_shape`, `venue_seat.x/y`).
- **Yape/PagoEfectivo:** el canvas los muestra en el checkout; hay que quitarlos de la UI al implementar (solo tarjeta).
- **Propiedad de `venue`:** no está decidido quién crea recintos. El canvas de creación de evento tiene "Lugar" y "Ciudad" como campos libres. Decidir en el plan si los crea el organizador (requeriría `created_by`) o solo los admins.
- **Checkout con sesión:** `orders.user_id` es NOT NULL; no hay compra como invitado.
- **Búsqueda por ciudad:** usa `venue.city`, sin duplicarla en `event`.
- **Cambio de correo en Google:** `user.updated` actualiza `user.email`. Si choca con el UQ de otro `user`, el webhook falla y se revisa a mano (caso raro; sin merge automático de cuentas).
- **Cuenta eliminada en Clerk:** `user.deleted` hace soft delete (`deleted_at`); los pedidos y entradas se conservan.
- **Comisión:** vive en `platform_setting` (`platform_fee_percent`) y se copia a `orders.platform_fee_cents` al cobrar.
