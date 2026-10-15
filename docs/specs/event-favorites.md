# Favoritos de eventos

Estado: aprobada

## Objetivo

Hoy el corazón `SaveEventButton` del detalle de evento (`EventDetailHero`) solo guarda estado local: se pierde al recargar y no depende de la cuenta. Esta spec lo vuelve un favorito real: una tabla `user ↔ event`, un toggle persistente con `@tanstack/react-query` y el estado inicial correcto al cargar el detalle.

Hecho cuando: un usuario con sesión marca el corazón en un evento, recarga la página (o entra desde otro dispositivo) y el corazón sigue marcado; al desmarcarlo, deja de estarlo. Un visitante sin sesión que toca el corazón ve el inicio de sesión de Clerk y no se escribe nada.

Referencias:

- `erd.md §3` (grupo Identidad y Evento) y `§4–5` (invariantes e índices): el modelo **no tiene** una tabla de favoritos. Manda esta spec y la discrepancia se reporta en "Preguntas abiertas" (los docs de arquitectura no se modifican). Se sigue la convención del ERD: PK `uuid`, `created_at`/`updated_at`, `snake_case` en inglés, y la unicidad como invariante de la DB (como `event_zone_event_venue_zone_uq`).
- Auth y roles: `system-design.md §3` ("Roles y autorización") y `§5.5`. Las rutas protegidas del proyecto están en `src/proxy.ts` (`/admin`, `/organizer`, `/my-tickets`); el detalle `/events/[slug]` es público y **no se agrega al proxy**. Las acciones de servidor son alcanzables por POST directo (Next 16, `01-app/01-getting-started/07-mutating-data.md`), así que la sesión se verifica dentro de la acción, no solo en la UI.

### Decisiones tomadas (defaults razonables; ver "Preguntas abiertas")

- **Usuario sin sesión**: el corazón se envuelve en el `SignInButton` de Clerk (patrón ya usado en `Navbar.tsx` con `Show when="signed-out"`). Es lo más simple y coherente: no hay página nueva, no se protege la ruta pública del detalle y el usuario vuelve a la misma página al iniciar sesión. No se aplica el favorito automáticamente tras el login: el usuario vuelve a tocar el corazón. Como defensa, la acción también exige sesión con `requireRole("customer")` (mismo patrón que `reserveTicketsAction`: sin sesión → redirige a sign-in).
- **Toggle**: `useMutation` con actualización optimista local (el corazón cambia al instante; si la acción falla, vuelve al valor anterior). No hay `useQuery` ni invalidación porque no hay otra vista que muestre favoritos (YAGNI). El botón se deshabilita mientras la mutación está pendiente, para no encolar clics contradictorios.
- **Operación idempotente, no "toggle" en el servidor**: la acción recibe el estado deseado (`favorite: true | false`), no "invertir". Así reintentos y clics duplicados no dejan estado inconsistente.
- **Estado inicial desde el servidor**: la página del detalle (ya dinámica, renderiza por petición) consulta `getCurrentUser()` + `isEventFavorite` y pasa `isFavorite` al hero. Evita el parpadeo de un fetch en cliente. `getCurrentUser()` devuelve `null` sin sesión, así que el detalle sigue siendo público. `next.config.ts` no activa `cacheComponents` y la página no exporta `dynamic`/`revalidate`; leer la sesión en el cuerpo de la página (`auth()` lee cookies) la deja dinámica sin cambios de configuración, igual que `my-tickets/page.tsx`. Esa página también es el precedente de que la ruta compone sesión + lectura de datos (`requireRole` + `getMyOrders`) sin meter lógica de dominio: aquí `page.tsx` solo hace `user ? await isEventFavorite(user.id, event.id) : false`.
- **Módulo nuevo `favorite`** (SETUP §1: un módulo por dominio). `SaveEventButton.tsx` se queda en `src/modules/event/components` (ya es parte del hero del evento) y consume el hook del módulo `favorite`. Sin `relations` de Drizzle: las consultas usan `db.select` directo, como `event-public-service.ts`.

## Alcance

- Incluye:
  - Tabla `event_favorite` (`user_id`, `event_id`, `id`, `created_at`, `updated_at`) con FKs `ON DELETE CASCADE` a `user` y `event`, restricción única `(user_id, event_id)` e índice por `event_id`. La migración la **genera** el developer con `npm run db:generate`; la **aplica** el humano con `npm run db:migrate`.
  - Schema zod de entrada, service (`setEventFavorite`, `isEventFavorite`), server action `setEventFavoriteAction` y hook `useEventFavorite`.
  - `SaveEventButton` conectado: estado inicial, toggle optimista, rollback si falla, inicio de sesión si no hay sesión, `aria-label` y `aria-pressed` correctos.
  - `EventDetailHero` y `src/app/(platform)/events/[slug]/page.tsx` pasan el estado inicial.
- No incluye:
  - Listado "Mis favoritos" (página, ruta protegida en el proxy, enlace en el Navbar, tarjetas de evento): fuera de alcance por YAGNI; necesita ruta, entrada de navegación y un service de lectura con el mapeo a `EventCard`, es decir una fase aparte (ver "Próximas fases").
  - Corazón en las tarjetas del listado o de la landing, contador de favoritos por evento, notificaciones.
  - Newsletter: ya se eliminó de la UI (`Newsletter.tsx` borrado en el árbol de trabajo), fuera de alcance.
  - Aplicar el favorito automáticamente tras iniciar sesión.
  - Cambios en `src/proxy.ts`, en `docs/architecture/*` o en `layout.tsx` (`QueryClientProvider` ya existe en `src/components/Providers.tsx`).
  - Restringir el favorito a eventos publicados: basta con que el evento exista (FK). El detalle público ya solo muestra eventos publicados.

## Reutilizar

- `getCurrentUser` y `requireRole` de `src/modules/user/current-user.ts` (sesión → `UserRecord`; `requireRole("customer")` redirige a sign-in si no hay sesión).
- `Providers.tsx`: `QueryClientProvider` ya montado en `src/app/layout.tsx`.
- `SignInButton` y `Show` de `@clerk/nextjs` (patrón de `src/components/Navbar.tsx`).
- `pgErrorCode` de `src/lib/pg-error.ts` para detectar la violación de FK (`23503`: el evento no existe).
- Convenciones de `src/db/schema/*` (`id`, `timestamps` de `columns.ts`, `unique`/`index` con nombres explícitos como en `event.ts`) y patrón de acciones de `src/modules/booking/actions.ts` (sesión desde el servidor, `safeParse`, error genérico logueado).
- Patrón de hook + mutación pura testeable de `src/modules/event/hooks/use-event-mutations.ts` (la mutación exportada se prueba sin renderizar).
- `SaveEventButton.tsx` y `EventDetailHero.tsx` existentes: se modifican, no se reemplazan.
- No hay nada equivalente a favoritos en `src/modules/*`, `src/components` ni `src/lib` (verificado por nombre y por comportamiento). No hay `src/hooks`. No se necesita ningún componente shadcn nuevo.

## Archivos

Nuevos:

- `src/db/schema/favorite.ts`
- `drizzle/0005_<nombre generado>.sql`, `drizzle/meta/0005_snapshot.json` y el cambio en `drizzle/meta/_journal.json` (generados, no se editan a mano)
- `src/modules/favorite/favorite.schema.ts` y `favorite.schema.test.ts`
- `src/modules/favorite/favorite.types.ts`
- `src/modules/favorite/services/favorite-service.ts`
- `src/modules/favorite/actions.ts`
- `src/modules/favorite/hooks/use-event-favorite.ts` y `use-event-favorite.test.ts`

Modificados:

- `src/db/schema/index.ts` (agregar `export * from "./favorite";`)
- `src/modules/event/components/SaveEventButton.tsx`
- `src/modules/event/components/EventDetailHero.tsx`
- `src/app/(platform)/events/[slug]/page.tsx`

### Contratos

Tabla (`src/db/schema/favorite.ts`):

```ts
export const eventFavorite = pgTable(
  "event_favorite",
  {
    id,
    userId: uuid("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull().references(() => event.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    unique("event_favorite_user_event_uq").on(t.userId, t.eventId),
    index("event_favorite_event_id_idx").on(t.eventId),
  ],
);
```

`ON DELETE CASCADE` en `event` es necesario: `deleteEvent` hace hard delete y un favorito no debe impedirlo. El `unique (user_id, event_id)` ya cubre las consultas por usuario, por eso no hay índice extra por `user_id`.

Service (`favorite-service.ts`):

```ts
/** Idempotente: marcar dos veces o desmarcar algo no marcado no falla. */
export async function setEventFavorite(userId: string, eventId: string, favorite: boolean): Promise<void>;
export async function isEventFavorite(userId: string, eventId: string): Promise<boolean>;
```

`favorite = true` hace `INSERT ... ON CONFLICT DO NOTHING` sobre el par único; `false` hace `DELETE ... WHERE user_id = ? AND event_id = ?`.

Schema (`favorite.schema.ts`): `setFavoriteSchema = z.object({ eventId: z.uuid(), favorite: z.boolean() })`. El `userId` **nunca** viene del input.

Tipos (`favorite.types.ts`): `FavoriteActionResult = { ok: true } | { ok: false; error: string }`.

Acción (`actions.ts`, `"use server"`): `setEventFavoriteAction(input: unknown): Promise<FavoriteActionResult>`. Orden: `requireRole("customer")` → `safeParse` → `setEventFavorite`. Entrada inválida → `{ ok: false, error: "Datos inválidos." }`. Violación de FK (`pgErrorCode === "23503"`) → `{ ok: false, error: "Este evento ya no está disponible." }`. Cualquier otro fallo → `console.error` sin datos personales y `{ ok: false, error: "No pudimos guardar el favorito. Intenta de nuevo." }`. Sin `revalidatePath`: ninguna página cacheada depende del favorito.

Hook (`use-event-favorite.ts`, `"use client"`):

```ts
/** La mutación pura (se prueba sin renderizar): devuelve en éxito, lanza el mensaje de la acción en error. */
export async function setFavoriteMutation(variables: { eventId: string; favorite: boolean }): Promise<void>;
export function useEventFavorite(eventId: string, initialSaved: boolean): {
  isSaved: boolean;
  isPending: boolean;
  toggle: () => void;
};
```

`useEventFavorite` guarda `isSaved` en `useState(initialSaved)` y usa `useMutation({ mutationFn: setFavoriteMutation, onMutate: aplica el valor deseado, onError: vuelve al valor previo })`. `toggle` pide el valor contrario al actual.

Componentes: `SaveEventButton({ eventId, initialSaved, className })`. `EventDetailHero({ event, isFavorite })` pasa `eventId={event.id}` e `initialSaved={isFavorite}`. En `page.tsx` se agrega `getCurrentUser()` + `isEventFavorite(user.id, event.id)` (sin sesión → `false`) dentro de un `Promise.all` junto a las lecturas existentes del evento.

## Criterios de aceptación

- AC1: `src/db/schema/favorite.ts` define `event_favorite` como en "Contratos" y está exportada desde `src/db/schema/index.ts`; `npm run db:generate` produce una migración `0005` que crea la tabla con ambas FKs `ON DELETE CASCADE`, el único `event_favorite_user_event_uq (user_id, event_id)` y el índice `event_favorite_event_id_idx`, sin alterar otras tablas.
- AC2: `setFavoriteSchema` acepta `{ eventId: <uuid>, favorite: true | false }` y rechaza: `eventId` que no es UUID, `favorite` ausente o no booleano, y valores distintos de un objeto.
- AC3: `setEventFavorite(userId, eventId, true)` inserta una fila con `ON CONFLICT DO NOTHING`; llamarla dos veces seguidas no lanza ni duplica. `setEventFavorite(userId, eventId, false)` borra solo la fila de ese par y no lanza si no existía.
- AC4: `isEventFavorite` devuelve `true` si existe la fila `(userId, eventId)` y `false` si no (incluido otro usuario con el mismo evento).
- AC5: `setEventFavoriteAction` toma el usuario de la sesión (`requireRole("customer")`) y nunca de `input`; con entrada inválida responde `{ ok: false, error: "Datos inválidos." }` sin tocar la DB; con FK `23503` responde el mensaje de evento no disponible; con cualquier otro error responde el mensaje genérico y loguea sin datos personales.
- AC6: al cargar `/events/[slug]` con sesión y el evento ya guardado, el corazón se pinta marcado (`aria-pressed="true"`, relleno rosa) desde el primer render del servidor, sin parpadeo; si no está guardado o no hay sesión, se pinta sin marcar. El detalle sigue cargando sin sesión (sin redirección).
- AC7: con sesión, al tocar el corazón cambia al instante (optimista) y queda persistido: tras recargar, el estado coincide. Tocarlo de nuevo lo desmarca y también persiste.
- AC8: si la acción devuelve `{ ok: false }` o lanza, el corazón vuelve al estado anterior; mientras la mutación está pendiente el botón está `disabled`.
- AC9: sin sesión, tocar el corazón abre el inicio de sesión de Clerk (`SignInButton`) y no se llama a `setEventFavoriteAction`.
- AC10: accesibilidad: el botón tiene `aria-label="Guardar evento"` cuando no está guardado y `aria-label="Quitar de favoritos"` cuando sí, más `aria-pressed` coherente, y conserva `className` y el foco visible que ya recibe del hero.
- AC11: `src/proxy.ts` y `layout.tsx` no cambian; `npx vitest run`, `npm run lint` y `npx tsc --noEmit` pasan.

## Tests requeridos

Vitest, junto al archivo (lógica de negocio: schema y hook; SETUP §3). No hay `@testing-library` instalado: no se prueban componentes (puramente visuales) ni el render del hook; la lógica se prueba en la mutación pura y el service.

- `favorite.schema.test.ts` (AC2): caso válido con `true` y con `false`; UUID inválido; `favorite` faltante; `favorite` como string `"true"`; entrada no objeto.
- `favorite-service.ts` (AC3, AC4): **sin test unitario**. Es acceso a datos puro (un `insert`/`delete`/`select` de Drizzle sin lógica propia) y el proyecto no tiene precedente de mockear `@/db` (ningún test lo hace); los `*-data-service.ts` como `checkout-data-service.ts` tampoco se prueban, solo la lógica que los consume con el servicio de datos mockeado. Se cubre con la verificación manual de abajo y la revisión.
- `use-event-favorite.test.ts` (AC5 en el borde cliente, AC8): se mockea `@/modules/favorite/actions`; `setFavoriteMutation` resuelve con `{ ok: true }`, lanza `Error` con el mensaje de la acción con `{ ok: false, error }`, y llama a la acción con exactamente `{ eventId, favorite }`.
- `actions.ts` (AC5): sin test unitario, se mantiene delgada (sesión, `safeParse`, service, mapeo de errores) y el reviewer la valida contra AC5 en el código; ver pregunta abierta 7.

Verificación manual (la hace el reviewer o el humano, con la migración aplicada; cubre AC3, AC4 y la unicidad y los cascades de AC1): marcar doble clic/reintento sin error ni duplicados, marcar, recargar y desmarcar con sesión; el mismo evento con otra cuenta no aparece marcado; sin sesión el clic abre Clerk; borrar un evento con favoritos funciona (cascade).

## Tareas

### T1 — Tabla `event_favorite` y migración

- Archivos: `src/db/schema/favorite.ts`, `src/db/schema/index.ts`, `drizzle/0005_*.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json`
- Depende de: —
- Paralelizable: no (base: todo lo demás importa `eventFavorite`)
- Cubre: AC1

El developer corre `npm run db:generate` (necesita `.env` con `DATABASE_URL`, ver `drizzle.config.ts`) y no corre `db:migrate`; aplicar la migración es del humano.

### T2 — Schema, tipos y service del módulo `favorite`

- Archivos: `src/modules/favorite/favorite.schema.ts`, `src/modules/favorite/favorite.schema.test.ts`, `src/modules/favorite/favorite.types.ts`, `src/modules/favorite/services/favorite-service.ts`
- Depende de: T1
- Paralelizable: no (depende de T1; T3 depende de este)
- Cubre: AC2, AC3, AC4 (AC3 y AC4 sin test unitario, ver "Tests requeridos")

### T3 — Server action y hook de mutación

- Archivos: `src/modules/favorite/actions.ts`, `src/modules/favorite/hooks/use-event-favorite.ts`, `src/modules/favorite/hooks/use-event-favorite.test.ts`
- Depende de: T2
- Paralelizable: no (importa el service, el schema y los tipos de T2)
- Cubre: AC5, AC7, AC8

### T4 — UI del corazón y estado inicial en el detalle

- Archivos: `src/modules/event/components/SaveEventButton.tsx`, `src/modules/event/components/EventDetailHero.tsx`, `src/app/(platform)/events/[slug]/page.tsx`
- Depende de: T3
- Paralelizable: no (usa el hook de T3 y `isEventFavorite` de T2)
- Cubre: AC6, AC7, AC8, AC9, AC10, AC11

Las 4 tareas son secuenciales (T1 → T2 → T3 → T4): cada una importa símbolos de la anterior, así que el orquestador no puede paralelizarlas sin que el typecheck falle a mitad de camino.

## Preguntas abiertas

1. **Aprobar la tabla `event_favorite`**: no existe en `erd.md §3`; manda esta spec y habría que actualizar el ERD aparte (los agentes no lo modifican). ¿Nombre `event_favorite` y `ON DELETE CASCADE` en ambas FKs (borrar un evento o un usuario borra sus favoritos) están bien?
2. **¿Listado "Mis favoritos" ahora o después?** Se dejó fuera por YAGNI, pero sin él los favoritos son solo-escritura para el usuario (solo se ven al abrir cada evento). Si se quiere en esta entrega, es una fase 2 de ~3 tareas: ruta `/favorites` (agregarla a `isProtected` de `src/proxy.ts`), enlace en `Navbar.tsx` y un service que devuelva los favoritos mapeados a las tarjetas existentes (`EventGrid`/`toPublicEvents`).
3. **Sin sesión**: se eligió abrir el `SignInButton` de Clerk en el mismo corazón en vez de redirigir a `/sign-in`. ¿Se prefiere aplicar el favorito automáticamente al volver del login? Costaría un parámetro de retorno o un `sessionStorage`; hoy no se hace.
4. **¿Qué roles pueden guardar?** Se usa `requireRole("customer")`, el rol mínimo, así que cualquier usuario con sesión (incluidos organizadores y admins) puede guardar favoritos. Confirmar que es lo deseado.
5. **Eventos no públicos**: la acción solo exige que el evento exista; no verifica que esté publicado ni que no haya empezado. Un favorito de un evento que luego se cancela o pasa queda guardado. ¿Se necesita limpiarlos o filtrarlos (relevante solo cuando exista el listado)?
6. **Aplicar la migración**: el developer solo genera `0005`. ¿Quién la aplica en la base de Neon y cuándo? Sin ella, el detalle fallaría al consultar `isEventFavorite` para usuarios con sesión; conviene aplicarla antes de desplegar T4.
7. **Cobertura**: el service y la acción no tienen test unitario (ver "Tests requeridos"): el service es acceso a datos puro sin precedente de mock de `@/db` en el proyecto, y mockear `requireRole`, Clerk y el service en la acción solo probaría los mocks. ¿Se acepta, o se pide un test de integración con DB real / extraer el mapeo de errores a una función pura probada?
8. **Next 16 / Clerk (a verificar en la implementación)**: la doc local de `07-mutating-data.md` confirma la verificación de sesión dentro de la acción, pero no se contrastó el comportamiento de un `redirect()` de una acción invocada desde `useMutation`. Por eso el cliente no depende de él (el flujo sin sesión usa `SignInButton`) y `requireRole` es solo defensa. El developer debe confirmar que `SignInButton` envuelve un `<button>` sin romper estilos ni accesibilidad.

## Próximas fases

- Fase 2: listado "Mis favoritos" (`/favorites`) con ruta protegida, enlace en el Navbar y reutilización de `EventGrid`.
- Corazón en `EventCard` (listado y landing), con el estado de favoritos cargado en una sola consulta por página.
- Aplicar el favorito tras el login (retorno con intención pendiente).
