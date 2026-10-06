# Panel de organizador con datos reales + hook reutilizable de eventos

Estado: aprobada

## Objetivo

`/organizer` hoy muestra datos mock (`getOrganizerEvents`) y eventos guardados en el navegador (zustand). Pasa a mostrar **datos reales de la DB**: entradas vendidas, ingresos, eventos publicados y el listado de eventos del organizador. Como el listado de eventos se repetirá en otras vistas (admin, moderación, etc.), se construye un **hook reutilizable `useEvents`** con seguridad de roles aplicada en el servidor.

Roles y permisos: `system-design.md §3`; reglas en `src/modules/user/user.permissions.ts` (`event:manage-own`, `report:view-global`). Tablas: `erd.md §3` (Evento, Compra y pago, Entrada).

## Alcance

- Incluye:
  - **Servicio de listado** `listManagedEvents(actor, query)`: devuelve eventos con `sold`, `capacity`, `revenueCents`, paginado y filtrable por `status` y búsqueda `q` (título, insensible a mayúsculas, `%`/`_` literales con `escapeLike`).
  - **Alcance por rol, resuelto en el servidor** (`resolveEventScope`): `organizer` → solo eventos de su propio `organizer` (derivado de la sesión, nunca de la entrada del cliente); `admin`/`super_admin` → todos, con `organizerId` opcional como filtro; `customer` → sin acceso. Un organizador sin fila `organizer` recibe lista vacía.
  - **Resumen de ventas** `getSalesSummary(actor)`: entradas vendidas, ingresos y eventos publicados, con el mismo alcance por rol. Solo eventos `published` (y `finished`, ver Preguntas abiertas) cuentan en vendidas/ingresos.
  - **Server action** `listEventsAction(input)`: valida con zod, exige `requireRole("organizer")`, devuelve `ActionResult`-like con datos.
  - **Hook cliente** `useEvents(query)` (React Query) que llama a la action; reutilizable con cualquier combinación de filtros.
  - **`QueryClientProvider`** en un wrapper de providers (hoy no existe).
  - **Dashboard**: tarjetas con datos reales; listado "Mis eventos" con `useEvents`, filtros Todos/Publicados/Borradores contra el servidor, estados de carga, vacío y error.
- No incluye:
  - Crear/editar/publicar eventos en la DB (el formulario de creación sigue siendo mock; ver Preguntas abiertas).
  - Pantalla "Ver ventas" por evento, gráficos, exportaciones, ordenamiento por columna.
  - Cambios en `proxy.ts`, en el schema de la DB o en el seed.

## Definición de métricas

Hoy la DB no tiene órdenes (el checkout es mock), pero sí inventario sembrado. Las métricas se derivan del **inventario**, que es la fuente real de lo vendido:

- **Vendidas** por evento = Σ por `event_zone`: `sold_count` (zonas GA) + cantidad de `event_seat` con `status='sold'` (zonas numeradas).
- **Capacidad** = Σ `event_zone.capacity` (GA) + total de `event_seat` de zonas numeradas.
- **Ingresos** por evento = Σ por zona de `vendidas_de_la_zona × price_cents`, en la moneda del evento (centavos → se formatean con `formatEventPrice`).
- **Eventos publicados** = eventos con `status='published'` del alcance.

## Reutilizar

- `requireRole`, `getCurrentUser` (`current-user.ts`); `hasRole`, `can` (`user.permissions.ts`); `ActionResult` (`user.types.ts`).
- `escapeLike` de `src/lib/utils.ts`; patrón de paginación/consulta de `listUsersPage` y `user.schema.ts` (`USERS_PAGE_SIZES`).
- `@tanstack/react-query` (instalado, sin provider).
- UI: `OrganizerDashboard`, `OrganizerEventRow`, `EVENT_TABLE_COLUMNS`, `formatEventPrice`, `formatEventDateParts`; shadcn `pagination` si se pagina.
- Tipo `OrganizerEvent` se extiende/mapea; no se duplica la fila.

## Archivos

Nuevos / modificados:
- `src/components/Providers.tsx` (QueryClientProvider) y `src/app/layout.tsx` (envolver `children`)
- `src/modules/event/event-list.schema.ts` + test (`eventListQuerySchema`)
- `src/modules/event/event-list.types.ts` (`EventListQuery`, `ManagedEventRow`, `SalesSummary`)
- `src/modules/event/event-list.scope.ts` + test (`resolveEventScope`, función pura)
- `src/modules/event/services/event-list-service.ts` (`listManagedEvents`, `getSalesSummary`)
- `src/modules/event/actions.ts` (`listEventsAction`)
- `src/modules/event/hooks/use-events.ts` + test (query key estable y llamada a la action)
- `src/modules/organizer/components/OrganizerDashboard.tsx`, `OrganizerEventRow.tsx` (datos reales)
- `src/app/(admin)/organizer/page.tsx` (carga `getSalesSummary` en el servidor)
- `src/modules/organizer/services/organizer-service.ts` + test (se elimina el mock `SALES`/`getOrganizerEvents`; `getOrganizerKpis` se retira)

## Criterios de aceptación

- AC1: `/organizer` muestra entradas vendidas, ingresos y eventos publicados calculados desde la DB según "Definición de métricas"; con el seed actual cuadran con `event_zone.sold_count` y `event_seat.status='sold'`.
- AC2: un `organizer` solo ve y suma sus propios eventos; ni la entrada del cliente (`organizerId`) ni la URL pueden ampliar su alcance.
- AC3: `admin` y `super_admin` ven todos los eventos y pueden filtrar por `organizerId`; `customer` o sin sesión no obtienen datos (la action rechaza aunque se invoque directamente).
- AC4: `useEvents(query)` es reutilizable (acepta `status`, `q`, `page`, `pageSize`, `organizerId`), tiene query key estable por consulta y expone `data`, `isLoading`, `isError`.
- AC5: el listado soporta filtros Todos/Publicados/Borradores contra el servidor, paginación y búsqueda; `pageSize` acepta solo valores permitidos y `page` fuera de rango se ajusta.
- AC6: estados de carga (skeleton accesible), vacío ("No tienes eventos en este filtro") y error (mensaje + reintentar).
- AC7: ingresos y vendidas de borradores se muestran como `—`/0 y no entran en las tarjetas.
- AC8: toda entrada se valida con zod; errores del servidor no filtran detalles internos.
- AC9: el dashboard ya no usa datos mock ni `createdEvents` del store para el listado.

## Tests requeridos

Vitest, junto al archivo: `event-list.schema.test.ts`, `event-list.scope.test.ts` (organizer/admin/super_admin/customer/organizerId ignorado), `use-events.test.ts` (query key), `organizer-service.test.ts` (actualizado). Los servicios con DB no se prueban con mocks de Drizzle (YAGNI); el alcance por rol queda cubierto por la función pura.

## Tareas

### T0 — Providers de React Query
- Archivos: `src/components/Providers.tsx`, `src/app/layout.tsx`
- Depende de: —
- Paralelizable: sí
- Cubre: AC4

### T1 — Capa de datos del listado y resumen
- Archivos: `src/modules/event/event-list.schema.ts` (+test), `event-list.types.ts`, `event-list.scope.ts` (+test), `services/event-list-service.ts`
- Depende de: —
- Paralelizable: sí
- Cubre: AC1, AC2, AC3, AC5, AC7, AC8

### T2 — Action y hook reutilizable
- Archivos: `src/modules/event/actions.ts`, `hooks/use-events.ts` (+test)
- Depende de: T0, T1
- Paralelizable: no
- Cubre: AC3, AC4, AC8

### T3 — Dashboard con datos reales
- Archivos: `src/modules/organizer/components/OrganizerDashboard.tsx`, `OrganizerEventRow.tsx`, `src/app/(admin)/organizer/page.tsx`
- Depende de: T1, T2
- Paralelizable: no
- Cubre: AC1, AC5, AC6, AC7, AC9

### T4 — Limpieza del mock
- Archivos: `src/modules/organizer/services/organizer-service.ts` (+test)
- Depende de: T3
- Paralelizable: no
- Cubre: AC9

## Preguntas abiertas

1. **Ingresos desde inventario vs. órdenes pagadas.** Se propone inventario × precio de zona porque no hay órdenes en la DB. Cuando el checkout persista órdenes, ¿pasamos a `orders.status='paid'` (menos reembolsos)? Se deja como siguiente fase.
2. **Eventos creados desde el formulario** (zustand, mock) dejarán de aparecer en el dashboard al usar solo datos reales. ¿Aceptable hasta persistir la creación en la DB (siguiente fase)?
3. **`finished` en las métricas**: se propone contar vendidas/ingresos de `published` y `finished`, y "publicados" solo `published`. ¿Correcto?
4. **Organizador `pending`/`suspended`**: la spec no lo bloquea (el layout solo exige rol). ¿Debe ver solo lectura o nada?
5. Valor por defecto de `pageSize` (propuesto 8, igual que usuarios).

## Próximas fases

- Persistir creación/edición/publicación de eventos en la DB.
- Pantalla "Ver ventas" por evento y métricas desde órdenes pagadas.
- Reutilizar `useEvents` en vistas de admin/moderación.
