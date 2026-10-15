# Dashboard de administración con métricas globales, gráficos y exportación

Estado: aprobada

## Objetivo

Hoy `/admin/dashboard` es un placeholder: `src/app/(admin)/admin/dashboard/page.tsx` muestra `<h1>Dashbaord</h1>` (con la errata) y el componente se llama `DasboardPage`. Esta spec lo reemplaza por un panel donde un admin ve **números reales sacados de la DB**:

- ventas e ingresos, comisión de la plataforma, eventos por estado, usuarios por rol y organizadores pendientes de aprobación;
- dos gráficos mensuales con **proyección**: ingresos por mes y usuarios nuevos por mes;
- dos botones para **exportar** esa información en PDF y en Excel;
- accesos directos para moderar organizadores y eventos.

Roles y permisos: `system-design.md §3 (Roles y autorización)`. "Ver reportes globales" corresponde a `admin` (y a `super_admin` por jerarquía), y en código es el permiso `report:view-global` de `src/modules/user/user.permissions.ts`.

Depende de la tarea 08 (webhook de Stripe) solo para que existan órdenes `paid` con `paid_at`. Ver "Coordinación con tarea 08".

Cabe en **una sola spec** de 5 tareas sin forzar nada: cada pieza nueva cae en una capa distinta (pura, datos, hojas cliente, composición), cada archivo tiene un solo dueño y las tareas de datos (T2) y de cliente (T3) corren en paralelo.

## Decisiones

1. **Fuente de ventas e ingresos: (a) en las tarjetas y (b) en la serie temporal.**
   - **Tarjetas:** se reutiliza `getSalesSummary(actor)` (inventario) para "Entradas vendidas" e "Ingresos", y la tabla `orders` solo para la comisión.
     - Justificación: un admin ya ve en `/organizer` las mismas tarjetas globales calculadas con `getSalesSummary`. Si el dashboard usara otra fuente, dos pantallas del mismo panel mostrarían ingresos distintos. Además es DRY y `event-list-service.ts` no se puede modificar.
     - Trade-off: los ingresos salen del inventario × `price_cents` actual de la zona (incluye ventas sembradas sin orden) y la comisión, del snapshot `orders.platform_fee_cents` guardado al cobrar. Como vienen de fuentes distintas, su cociente no es la tasa de comisión. Con reembolsos (tarea 12) cada fuente cambia de forma distinta:
       - el inventario solo baja si la tarea 12 libera asientos;
       - la comisión con `status='paid'` excluye por completo una orden `partially_refunded` o `refunded`.
   - **Gráfico "Ingresos por mes":** usa (b), `orders`. El inventario no tiene marca de tiempo de venta: `event_seat` y `event_zone` solo tienen `created_at` y `updated_at` genéricos, sin `sold_at`. La única fecha de cobro es `orders.paid_at`.
   - **Divergencia aceptada:** la suma de los meses del gráfico **no** coincide con la tarjeta "Ingresos". Antes del merge de la tarea 08, la tarjeta muestra ingresos sembrados y el gráfico está vacío. Para que el admin lo entienda, el gráfico lleva una nota con su fuente. Alinear las tarjetas con (b) queda en Preguntas abiertas (P1).
2. **Stat card compartida.** Se crea un componente presentacional genérico, `src/components/ui/StatCard.tsx`, sin lógica de dominio, y se usa **solo** en el dashboard admin.
   - Justificación: el markup de tarjeta KPI ya existe inline en `OrganizerDashboard.tsx` y el admin lo repetiría 12 veces. Extraerlo evita duplicar.
   - Migrar `OrganizerDashboard` a esta tarjeta queda fuera de alcance, porque ese archivo no se toca en esta tarea.
3. **Patrón de datos: page async (server component) que llama al service directamente.** No hay server action, hook ni React Query.
   - Es el mismo patrón de `src/app/(admin)/admin/users/page.tsx` (KISS/YAGNI).
   - Los datos se leen en cada request: `requireRole` usa `auth()` y no hay `cacheComponents` en `next.config.ts`.
   - La interactividad nueva (tooltips de los gráficos, botones de exportar) va en **hojas `"use client"`**: `MonthlyTrendChart` y `ExportButtons`. Reciben los datos ya calculados como props.
     - Las props deben ser serializables (`node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`): meses como `"YYYY-MM"` (string, nunca `Date`) y unidades como string (`"cents" | "count"`), nunca funciones formateadoras.
   - `page.tsx` y `AdminDashboard.tsx` siguen siendo server components.
4. **Gráficos con TanStack Charts (`@tanstack/charts`).** No se usa shadcn `chart` ni Recharts, y no se crea `src/components/ui/chart.tsx`.
   - Justificación: decisión del humano, por coherencia con el stack TanStack que ya usa el proyecto (React Query, React Table).
     - Los marks se importan por subpath (`@tanstack/charts/line`, `/bar`, `/text`, `/tooltip`, `/scales/*`), así que no entra al bundle nada que no se use.
     - La librería soporta SSR e hidratación.
   - Paquete `@tanstack/charts`, fijado a **`^1.1.0`**. Componente React: `import { Chart } from "@tanstack/charts/react"`. Definición: `defineChart`, marks `lineY`, `barY`, `text` (y `dot`/`ruleY` si hacen falta), escalas desde `@tanstack/charts/scales/*`, tooltip desde `@tanstack/charts/tooltip`.
     - **No** se instalan `@tanstack/react-charts` ni el antiguo `react-charts`.
     - Los peers de otros frameworks (vue, svelte, lit, angular, react-native…) son opcionales: npm no los instala.
   - **Riesgo:** la 1.0.0 se publicó el 2026-10-03 y la 1.1.0 el 2026-10-09. Para la API real, manda la **documentación instalada** en `node_modules/@tanstack/charts/` (`README.md`, `llms.txt`, `docs/quick-start.md`, `docs/guides/`, incluida la guía "SSR and Hydration", y `docs/reference/`), no lo que se recuerde de otras librerías. Lo mismo que con Next 16.
   - El paquete trae `@tanstack/charts/regression`, pero **no** se usa para la proyección (ver decisión 6).
5. **Series mensuales en hora de Lima, con "un solo reloj".**
   - Buckets: `to_char(date_trunc('month', <col> at time zone 'America/Lima'), 'YYYY-MM')`. Es el mismo criterio que `limaDay` en `event-list-service.ts` (`at time zone 'America/Lima'`).
   - Ventana: los **últimos 6 meses incluido el mes en curso**, calculados en JS desde `now` con `toLimaDate`. `now` es inyectable en el service para tests deterministas.
   - Las consultas agrupan **todos** los meses, sin cota inferior en SQL, para que el `now()` de Postgres y el `new Date()` de JS nunca discrepen sobre la ventana. Luego `fillByKey(months, rows)` descarta lo que está fuera y pone 0 en los meses sin filas.
   - `ponytail:` acotar la consulta por fecha cuando `orders` y `user` crezcan, con la cota calculada desde el mismo `now`.
6. **Proyección = tendencia lineal por mínimos cuadrados.** La calcula una función pura en el servidor (`projectLinear`), así la pantalla, el PDF y el Excel muestran exactamente los mismos números, y queda con test.
   - Entrada: los 6 valores reales de la ventana, **incluido el mes en curso aunque esté incompleto** (default; ver P10). Los meses en 0 dentro de la ventana cuentan como observaciones reales.
   - Salida: los **3 meses siguientes**, cada valor redondeado (`Math.round`) y **acotado a ≥ 0**.
   - **Sin proyección** (array vacío) si en la ventana hay **menos de 2 meses con valor > 0**, todo en 0 incluido. Un solo mes con datos daría una "tendencia" inventada.
   - Comentario `ponytail:` en la función: sin estacionalidad; pasar a Holt-Winters cuando haya más de 12 meses de historia.
7. **Exportación en el cliente, sin ruta nueva y sin volver a consultar.** Se arma con las métricas que la page ya pasó como props. Las librerías se cargan con `import()` dinámico **dentro del handler del clic**, fuera del bundle inicial (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`, "Loading External Libraries"). Es el mismo patrón que `downloadTicketsPdf`.
   - **PDF:** se reutiliza `jspdf`, que ya está instalado (precedente: `src/modules/booking/ticket-export.ts`). Sin `jspdf-autotable`. Los gráficos no se incluyen como imagen (P9).
   - **Excel:** se agrega `exceljs` (`^4.4.0`), porque una dependencia nueva es inevitable. **No** se usa `xlsx` de npm, que está estancado en 0.18.5 con CVEs conocidos.
   - La lógica testeable (filas de KPIs, tabla mensual, nombre de archivo) son funciones puras con tests (`admin-report.ts`). Los builders que solo dibujan el PDF o escriben el xlsx (`admin-export.ts`) quedan sin test, con el mismo criterio que `downloadTicketsPdf`, que `ticket-export.test.ts` no cubre.
   - Nombre de archivo: `ticketera-dashboard-YYYY-MM-DD.pdf|xlsx`, con la fecha del día en Lima.
8. **Una sola fuente de KPIs.** `toKpiSections(metrics)` define secciones, etiquetas, orden y unidad de cada KPI. La usan el dashboard, el PDF y el Excel, así que nunca discrepan (DRY).
9. **Separación servidor/cliente de los helpers.**
   - `admin-metrics.utils.ts` importa valores de `@/db/schema` (`eventStatus.enumValues`) y solo lo usa el service.
   - Los helpers que llegan a componentes cliente no importan valores de `@/db` ni de `@/db/schema`. Solo `import type`, para no meter drizzle en el bundle del navegador. Son `admin-series.utils.ts` y `admin-report.ts`, y por transitividad `event-status-labels.ts`, `role-labels.ts`, `user.permissions.ts` y `event-list.utils.ts`.
10. **Renombre respecto del borrador anterior.** `CountRow`/`fillCounts` pasan a `AggregateRow<K> { key; value }`/`fillByKey`, porque ahora también agregan sumas (centavos por mes), no solo conteos.

## Alcance

- Incluye:
  - Un service `getAdminMetrics(actor, now?)` que **falla cerrado por rol** (`can(actor.role, "report:view-global")`) antes de cualquier consulta y devuelve todas las métricas, series incluidas, en un objeto.
  - Una capa de datos con agregados de solo lectura sobre `orders`, `event`, `user` y `organizer`, incluidos dos agregados mensuales: ingresos pagados por mes de `paid_at` y usuarios nuevos por mes de `created_at`.
  - Helpers puros con tests:
    - relleno con 0 de estados, roles y meses;
    - ventana de meses en Lima y etiquetas de mes;
    - proyección lineal;
    - partición de la serie para el gráfico;
    - catálogo de KPIs y su formato;
    - tabla mensual y nombre de archivo de la exportación.
  - El componente genérico `StatCard`.
  - Un componente cliente `MonthlyTrendChart` (TanStack Charts) para los dos gráficos, con su estado vacío y su tabla accesible.
  - Un componente cliente `ExportButtons` y los builders de PDF (`jspdf`) y Excel (`exceljs`).
  - Un componente `AdminDashboard` (server component) con:
    - la fila de título con los botones de exportar;
    - cuatro grupos de KPIs (ventas, eventos por estado, usuarios por rol, moderación);
    - la sección "Tendencias" con los dos gráficos;
    - dos accesos directos: organizadores pendientes, a `/admin/users?role=organizer&status=pending`, y moderar eventos, a `/organizer`, donde el admin ya ve todos los eventos.
  - Reemplazar el placeholder de `/admin/dashboard`: el componente pasa a llamarse `AdminDashboardPage`, se corrige la errata y se agrega `metadata`.
  - Instalar `@tanstack/charts@^1.1.0` y `exceljs@^4.4.0`.
- No incluye:
  - Filtros por fecha, organizador o evento, ni rango de meses configurable: la ventana fija es 6 + 3 (P11).
  - Gráficos de comisión, de eventos por estado o de usuarios por rol. Solo los dos gráficos mensuales, y la comisión **no** se grafica (su tarjeta ya la cubre).
  - Proyecciones con estacionalidad o modelos distintos de la regresión lineal.
  - Gráficos como imagen dentro del PDF (P9), exportación CSV, exportación desde el servidor (route handler) y envío por correo.
  - shadcn `chart`, Recharts, `src/components/ui/chart.tsx`, `@tanstack/react-charts`, `react-charts`, `jspdf-autotable` y `xlsx`.
  - El refactor de `OrganizerDashboard.tsx` para usar `StatCard`.
  - Cualquier cambio en archivos de la tarea 08 (ver "Coordinación con tarea 08").
  - Cambios de schema o migraciones (`src/db/schema/**`, `drizzle/**`).
  - Cambios en `src/modules/panel/panel-nav.ts`, que ya tiene el item Dashboard.
  - Cambios en `src/modules/event/services/event-list-service.ts` y en `src/modules/booking/ticket-export.ts` (solo se importan).
  - Embudo de pagos (órdenes `pending`/`failed`), reembolsos, `loading.tsx` y `error.tsx` propios.

## Coordinación con tarea 08

La tarea 08 (webhook de Stripe: confirmar pago y emitir entradas) se implementa **en paralelo en otra rama**. Ambas se mergean a `main`.

- **Archivos prohibidos para esta spec.** No aparecen en "Archivos" ni en ninguna tarea, ni siquiera para un cambio mínimo:
  - `src/modules/booking/services/order-service.ts`
  - `src/modules/booking/services/reservation-service.ts`
  - `src/modules/booking/services/checkout-service.ts`
  - `src/modules/payment/**`
  - `src/db/schema/**` (solo se **importan** `orders`, `event`, `user`, `organizer` y `eventStatus`)
  - `drizzle/**`
  - `src/app/api/webhooks/**`
  - `src/modules/event/services/event-list-service.ts` (solo se **importa** `getSalesSummary`)
- **Tampoco se tocan** `src/modules/panel/panel-nav.ts`, `src/modules/organizer/components/OrganizerDashboard.tsx` ni `src/modules/booking/ticket-export.ts` (solo se **importa** `downloadFile`).
- **Archivos existentes que se modifican:**
  - `src/app/(admin)/admin/dashboard/page.tsx` (T4);
  - `package.json` y `package-lock.json` (T0, por `@tanstack/charts` y `exceljs`).
  
  Todo el resto del código nuevo va en archivos nuevos.
- **Riesgo de merge en `package.json`/`package-lock.json`:** son el único punto de choque posible con la rama de 08, si 08 también agrega o actualiza dependencias. Al mergear:
  - se conservan las dependencias de ambas ramas en `package.json`;
  - el lockfile **se regenera** con `npm install`, nunca se edita a mano;
  - luego se corren `npm run lint`, `npx vitest run` y `npm run build`.

  No se evita el cambio: es inevitable y se resuelve en el merge.
- **Contrato con la tarea 08 (ampliado):** esta spec depende de que la tarea 08, al confirmar el cobro, deje en la orden **`orders.status = 'paid'` y `orders.paid_at` con el instante del cobro**.
  - Una orden `paid` con `paid_at` nulo **suma** en la tarjeta "Comisión de la plataforma" pero **no aparece** en el gráfico "Ingresos por mes": no tiene mes al que asignarse.
  - Mientras 08 no se mergee no hay órdenes `paid`, así que **la comisión muestra S/ 0 y el gráfico de ingresos muestra su estado vacío**, y ese es el comportamiento correcto. El criterio es "números reales de la DB", no "distintos de cero".
  - El gráfico de usuarios nuevos no depende de 08: funciona desde el primer día.
- La comisión **nunca** se calcula como `ingresos × platform_fee_percent`. Es el snapshot `orders.platform_fee_cents` guardado al cobrar (ver tarjeta 15).

## Definición de métricas

Todas son globales, sin filtro por organizador. Se suman en centavos y se formatean asumiendo una sola moneda, PEN: es la misma limitación `ponytail:` documentada en `getSalesSummary`, porque `orders` no tiene columna de moneda.

### Tarjetas (KPIs)

| KPI | Fuente exacta |
|---|---|
| **Entradas vendidas** | `getSalesSummary(actor).sold`: Σ `event_zone.sold_count` (zonas GA) + nº de `event_seat` con `status='sold'` (zonas numeradas), solo en eventos con `event.status in ('published','finished')`. |
| **Ingresos** | `getSalesSummary(actor).revenueCents`: Σ por zona de `vendidas × event_zone.price_cents`, en los mismos eventos. |
| **Comisión de la plataforma** | `select coalesce(sum(orders.platform_fee_cents), 0) from orders where orders.status = 'paid'`. El `coalesce` es necesario porque `sum` sobre cero filas devuelve `NULL`. Además, `sum(integer)` es `bigint`, así que se aplica `.mapWith(Number)`. |
| **Eventos por estado** | `select event.status, count(*) from event group by event.status`. Se rellenan con 0 los estados del enum `event_status` sin filas (`draft`, `published`, `cancelled`, `finished`, en ese orden). |
| **Usuarios por rol** | `select user.role, count(*) from "user" where user.deleted_at is null group by user.role`. Se rellenan con 0 los roles sin filas (`super_admin`, `admin`, `organizer`, `customer`, en el orden de `ROLES`). |
| **Organizadores pendientes** | `select count(*) from organizer inner join "user" on user.id = organizer.user_id where organizer.status = 'pending' and user.role = 'organizer' and user.deleted_at is null`. |

### Series mensuales (gráficos)

| Serie | Fuente exacta |
|---|---|
| **Ingresos por mes** | `select to_char(date_trunc('month', orders.paid_at at time zone 'America/Lima'), 'YYYY-MM') as key, coalesce(sum(orders.total_cents), 0) as value from orders where orders.status = 'paid' and orders.paid_at is not null group by 1`. `value` es `bigint`, así que lleva `.mapWith(Number)`. |
| **Usuarios nuevos por mes** | `select to_char(date_trunc('month', "user".created_at at time zone 'America/Lima'), 'YYYY-MM') as key, count(*) as value from "user" where "user".deleted_at is null group by 1`. `count(*)` es `bigint`, así que lleva `.mapWith(Number)`. |

Para las dos series:

- **Ventana:** los 6 meses `"YYYY-MM"` que terminan en el mes en curso **de Lima**, calculado desde `now` con `toLimaDate`. Se rellena con 0 cada mes sin fila y se ignoran las filas fuera de la ventana.
- **Proyección:** `projectLinear` (decisión 6) sobre esos 6 valores, aplicada a los 3 meses siguientes. Si no se puede proyectar, la serie tiene solo 6 puntos.
- Cada punto es `{ month: "YYYY-MM", label, value, projected }`. `label` (`"oct 2026"`) se calcula **en el servidor** con `formatMonthLabel`, así el SSR y la hidratación del cliente usan el mismo texto aunque el ICU del navegador difiera del de Node.

Notas:

- **`orders.total_cents` es lo que paga el comprador.** Hoy es igual a `subtotal_cents`, porque `calculateOrderAmounts` (`src/modules/booking/checkout.utils.ts`) hace `totalCents: subtotalCents` y la comisión se descuenta al organizador. **No** se le suma la comisión.
- **Organizadores pendientes** replica exactamente el `where` de `listUsersPage` con `role=organizer&status=pending` (`isNull(user.deletedAt)` + `user.role='organizer'` + `organizer.status`), para que el KPI coincida con el total que muestra el acceso directo. Se excluyen los usuarios borrados porque `softDeleteUser` (webhook de Clerk) no suspende la fila `organizer`, así que pueden quedar filas `pending` de usuarios borrados.
- `getSalesSummary` también devuelve `published`, pero **no se renderiza**. Para "Publicados" la única fuente es el conteo por estado, así no hay dos números para el mismo concepto.

## Reutilizar

- **`getSalesSummary(actor)`**, de `src/modules/event/services/event-list-service.ts`. Solo se importa. Ya es global para `admin`/`super_admin` (alcance `all` vía `report:view-global`) y falla cerrado con `requireScope`.
- **Cómo se obtiene el actor:** la page llama `requireRole(...)` de `src/modules/user/current-user.ts` y pasa el `UserRecord` devuelto al service.
  - Es el mismo patrón que `src/app/(admin)/organizer/page.tsx` (`const user = await requireRole("organizer"); getSalesSummary(user)`) y que `src/app/(admin)/admin/users/page.tsx`.
  - Volver a llamar `requireRole("admin")` en la page no cuesta nada: `getCurrentUser` está memoizado por request con `cache`.
- **Patrón de guard fail-closed:** `requireScope` en `event-list-service.ts` (`throw new Error("Forbidden")` antes de consultar) y `resolveEventScope` en `src/modules/event/event-list.scope.ts`.
- **Hora de Lima:**
  - `toLimaDate` (de `src/modules/event/event-list.utils.ts`, puro, sin imports) para el mes en curso y para la fecha del nombre de archivo.
  - En SQL, el mismo `at time zone 'America/Lima'` que `limaDay` en `event-list-service.ts`. `limaDay` no se exporta, así que se replica el criterio, no el símbolo.
- **Permisos y listas de claves:** `can` y `ROLES` (de `src/modules/user/user.permissions.ts`, client-safe) y `eventStatus.enumValues` (de `@/db/schema`, solo importar y solo en `admin-metrics.utils.ts`).
- **Tipos:** `EventStatus` (de `src/modules/event/event-list.types.ts`) y `Role` (de `src/modules/user/user.types.ts`). Ambos son `import type`.
- **Etiquetas:** `ROLE_LABEL` (de `src/modules/user/components/role-labels.ts`). Se puede importar desde un server component y desde un helper client-safe: no es módulo cliente y ya lo usa `src/app/(admin)/layout.tsx`.
- **No se reutiliza `STATUS_LABEL`** de `src/modules/organizer/components/OrganizerEventRow.tsx`. Ese archivo es `"use client"`: importar el objeto desde un server component da una referencia de cliente, no el valor.
  - Se crea `EVENT_STATUS_LABEL` en `src/modules/event/components/event-status-labels.ts`, con los mismos textos y en paralelo a `role-labels.ts`.
  - Que `OrganizerEventRow` y `OrganizerEventFilters` lo consuman queda para la próxima fase.
- **Formato:** `formatEventPrice(cents / 100, "PEN")` (de `src/modules/event/event.utils.ts`) para montos y `new Intl.NumberFormat("es-PE")` para conteos, igual que `OrganizerDashboard`. Se centralizan en `formatMetricValue`.
- **Links y botones:** `next/link` + `buttonVariants` y `Button` (variante `outline`) de `src/components/ui/button.tsx`; `cn` de `src/lib/utils.ts`; íconos de `lucide-react` (`FileText`, `FileSpreadsheet` en exportar).
- **Clases de la tarjeta KPI:** se copian del `<dl>` de `OrganizerDashboard.tsx` a `StatCard` para mantener paridad visual. `OrganizerDashboard.tsx` no se modifica.
- **Acceso directo de organizadores:** no requiere cambios. `parseUsersQuery`/`usersQuerySchema` (de `src/modules/user/user.schema.ts`) ya parsean `role` y `status`, y `listUsersPage` ya filtra por ellos.
- **Patrón data-service + service con tests que mockean la capa de datos:** `src/modules/booking/services/checkout-data-service.ts` y su test `src/modules/booking/services/checkout-service.test.ts`.
- **Exportación (precedente: `src/modules/booking/ticket-export.ts`):**
  - `downloadTicketsPdf`: `const { jsPDF } = await import("jspdf")` dentro de la función, banda de cabecera índigo (`setFillColor(79, 70, 229)`) y `doc.save(...)`.
  - `downloadFile(fileName, data, type)`: **se importa** para descargar el `.xlsx`.
  - `pdfText`: es privado. Su criterio, que las fuentes base de jsPDF solo cubren Latin-1 y hay que reemplazar `—`/`–` por `-`, se **replica localmente** en `admin-export.ts` sin tocar el módulo booking.
- **Estado de carga de los botones:** el patrón de `OrderConfirmation.tsx` (`isPdfLoading`, `try/finally`, texto "Generando…").
- **TanStack Charts:** la doc instalada en `node_modules/@tanstack/charts/` (ver decisión 4). Hay que leerla antes de escribir `MonthlyTrendChart`.
- **shadcn:**
  - Se buscó `stat` y `kpi` con `npx shadcn@latest search @shadcn` y no hay componente equivalente.
  - `card` está instalado, pero no se usa en `StatCard`: su `ring` y `py` cambiarían el aspecto respecto de las tarjetas actuales del organizer y romperían la paridad para el refactor futuro.
  - shadcn `chart` existe (Recharts), pero se descarta por la decisión 4.

## Archivos

Nuevos:

- **`src/modules/admin/admin-metrics.types.ts`** (solo tipos):
  - `MonthKey = string`, en formato `"YYYY-MM"` y en hora de Lima.
  - `MetricUnit = "cents" | "count"`.
  - `AggregateRow<K extends string> { key: K; value: number }`.
  - `MonthlyPoint { month: MonthKey; label: string; value: number; projected: boolean }`.
  - `AdminMetrics { ticketsSold: number; revenueCents: number; platformFeeCents: number; eventsByStatus: Record<EventStatus, number>; usersByRole: Record<Role, number>; pendingOrganizers: number; revenueByMonth: MonthlyPoint[]; newUsersByMonth: MonthlyPoint[] }`.
  - `KpiItem { key: string; label: string; value: number; unit: MetricUnit }`.
  - `KpiSection { id: "sales" | "events" | "users" | "moderation"; title: string; items: KpiItem[] }`.
  - `ChartDatum { id: string; label: string; value: number }`.
  - `MonthlyReportRow { month: MonthKey; label: string; revenueCents: number | null; newUsers: number | null; projected: boolean }`.
- **`src/modules/admin/admin-series.utils.ts`** (client-safe: no importa `@/db` ni `admin-metrics.utils.ts`):
  - `SERIES_MONTHS = 6` y `PROJECTION_MONTHS = 3`.
  - `recentMonths(now: Date, count: number): MonthKey[]`: los `count` meses que terminan en el mes de Lima de `now` (`toLimaDate(now).slice(0, 7)`), en orden cronológico y cruzando el año si hace falta.
  - `followingMonths(month: MonthKey, count: number): MonthKey[]`: los `count` meses siguientes a `month`.
  - `formatMonthLabel(month: MonthKey): string`: `Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" })` sobre `${month}-01`, sin el punto y en minúsculas. Por ejemplo, `"2026-10"` da `"oct 2026"`. Es el mismo criterio que `formatPart` en `event.utils.ts`.
  - `projectLinear(values: number[], horizon: number): number[]`: regresión lineal por mínimos cuadrados con `x = 0..n-1`, evaluada en `x = n..n+horizon-1`.
    - Cada valor pasa por `Math.max(0, Math.round(v))`.
    - Devuelve `[]` si hay menos de 2 valores `> 0`.
    - Lleva el comentario `ponytail:` de la decisión 6.
  - `toMonthlySeries(months: MonthKey[], values: number[], horizon = PROJECTION_MONTHS): MonthlyPoint[]`: devuelve los puntos reales (`projected: false`) seguidos de los proyectados (`projected: true`), sobre `followingMonths(último, horizon)`. Cada punto lleva su `label`.
  - `isEmptySeries(points: MonthlyPoint[]): boolean`: `true` si todos los puntos **reales** valen 0.
  - `splitForChart(points: MonthlyPoint[], options: { bridge: boolean }): { actual: ChartDatum[]; projected: ChartDatum[] }`.
    - Con `bridge: true` (línea) y proyección presente, `projected` empieza con una copia del último punto real, con `id` distinto (`"<month>-bridge"`), para que el tramo discontinuo arranque donde termina el sólido.
    - Con `bridge: false` (barras) no se duplica ningún mes.
- **`src/modules/admin/admin-series.utils.test.ts`**
- **`src/modules/admin/admin-metrics.utils.ts`** (solo servidor: importa `eventStatus` de `@/db/schema` y solo lo usa el service):
  - `fillByKey(keys, rows)`: devuelve `Record<K, number>` con una entrada por cada clave de `keys`, en ese orden. Pone 0 donde no hay fila e ignora las filas cuya clave no está en `keys`. Se usa para estados, roles y meses.
  - `toAdminMetrics({ summary, platformFeeCents, eventRows, roleRows, pendingOrganizers, months, revenueRows, newUserRows })`:
    - aplica `fillByKey` con `eventStatus.enumValues`, `ROLES` y `months`;
    - arma `revenueByMonth`/`newUsersByMonth` con `toMonthlySeries`;
    - toma `summary.sold` y `summary.revenueCents` e ignora `summary.published`.
- **`src/modules/admin/admin-metrics.utils.test.ts`**
- **`src/modules/admin/admin-report.ts`** (client-safe, puro; lo usan `AdminDashboard`, el PDF y el Excel):
  - `formatMetricValue(value: number, unit: MetricUnit, options?: { compact?: boolean }): string`.
    - `count` usa `Intl.NumberFormat("es-PE")` y `cents` usa `formatEventPrice(value / 100, "PEN")`.
    - `compact` es para los ticks del eje Y. En `cents` no puede pasar por `formatEventPrice`, que fija sus opciones, así que arma su propio `Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", notation: "compact", maximumFractionDigits: 0 })`. `event.utils.ts` no se modifica.
  - `toKpiSections(metrics: AdminMetrics): KpiSection[]`: 4 secciones en este orden.
    - "Ventas": Entradas vendidas (`count`), Ingresos (`cents`), Comisión de la plataforma (`cents`).
    - "Eventos por estado": los 4 estados con `EVENT_STATUS_LABEL`, en el orden de las claves de `eventsByStatus`, que es el que fija `fillByKey`.
    - "Usuarios por rol": los 4 roles con `ROLE_LABEL`, en el orden de `ROLES`.
    - "Moderación": Organizadores pendientes (`count`).
    
    Son 12 ítems en total. No importa `@/db/schema`.
  - `buildMonthlyRows(revenue: MonthlyPoint[], users: MonthlyPoint[]): MonthlyReportRow[]`: une por `month` en orden cronológico.
    - Pone `null` donde una serie no tiene ese mes, por ejemplo cuando una proyecta y la otra no.
    - `projected` es `true` si algún punto de la fila es proyectado.
  - `exportFileName(ext: "pdf" | "xlsx", now = new Date()): string`: `ticketera-dashboard-${toLimaDate(now)}.${ext}`.
- **`src/modules/admin/admin-report.test.ts`**
- **`src/modules/event/components/event-status-labels.ts`**: `EVENT_STATUS_LABEL: Record<EventStatus, string>`, con las claves en el orden del enum: Borrador, Publicado, Cancelado, Finalizado.
- **`src/modules/admin/services/admin-metrics-data-service.ts`**: solo consultas Drizzle, sin lógica ni guard. Exporta:
  - `getPaidPlatformFeeCents(): Promise<number>`
  - `countEventsByStatus(): Promise<AggregateRow<EventStatus>[]>`
  - `countActiveUsersByRole(): Promise<AggregateRow<Role>[]>`
  - `countPendingOrganizers(): Promise<number>`
  - `sumPaidRevenueByMonth(): Promise<AggregateRow<MonthKey>[]>`
  - `countNewUsersByMonth(): Promise<AggregateRow<MonthKey>[]>`

  Las consultas son las de "Definición de métricas", sin cota inferior de fecha y con el `ponytail:` de la decisión 5. El archivo debe documentar que solo se llama desde `admin-metrics-service.ts`, que es quien aplica el guard.
- **`src/modules/admin/services/admin-metrics-service.ts`**: `getAdminMetrics(actor: { id: string; role: Role }, now = new Date()): Promise<AdminMetrics>`.
  - Primero el guard: `if (!can(actor.role, "report:view-global")) throw new Error("Forbidden")`, sin ningún `await` ni consulta antes.
  - Después, `months = recentMonths(now, SERIES_MONTHS)`.
  - Luego, `Promise.all` de `getSalesSummary(actor)` y las seis funciones de la data-service, y el resultado pasa por `toAdminMetrics`.
- **`src/modules/admin/services/admin-metrics-service.test.ts`**
- **`src/modules/admin/components/MonthlyTrendChart.tsx`** (`"use client"`).
  - Props, todas serializables: `{ title: string; points: MonthlyPoint[]; unit: MetricUnit; variant: "line" | "bar"; emptyMessage: string; note?: string }`.
  - Renderiza una `<section aria-labelledby>` con el `<h3>` del título.
  - Si `isEmptySeries(points)`, muestra **solo** `emptyMessage`: sin ejes, sin gráfico y sin tabla.
  - Si no, renderiza:
    - el `<Chart>` de `@tanstack/charts/react`, con `ariaLabel` descriptivo y `height` fija (~260 px);
    - la `note` en texto pequeño;
    - una `<table className="sr-only">` con los mismos datos: `caption` igual al título y columnas Mes, Valor (`formatMetricValue`) y Tipo ("Real" o "Proyección").
  - Hidratación: la tabla `sr-only` se renderiza en el servidor. Si los valores formateados con `Intl` difieren entre Node y el navegador (p. ej. el espacio de `S/`), aplicar el mismo arreglo que en las etiquetas de mes: precalcular el texto en el servidor o, como mínimo, `suppressHydrationWarning` en esas celdas.
  - Definición del gráfico:
    - Se construye con `defineChart` dentro de `useMemo`, porque la identidad de la definición es el límite de actualización del host.
    - Usa `splitForChart(points, { bridge: variant === "line" })`.
    - **Escala X** de categorías con **dominio fijo**: las `label` de todos los puntos en orden. Point scale para línea, band scale para barras.
    - **Un solo eje Y** lineal, desde 0, con `nice`, ticks con `formatMetricValue(…, { compact: true })` y grid horizontal **hairline sólida**. Sin grid vertical ni segundo eje.
    - `line`: un `lineY` sólido para `actual` y otro `lineY` con `strokeDasharray` (p. ej. `"6 4"`) para `projected`.
    - `bar`: un `barY` sólido para `actual` y otro `barY` para `projected`, con relleno claro (opacidad baja) y contorno del mismo color.
    - Etiqueta directa: un mark `text` con "Proyección", anclado al último mes proyectado, sobre el punto o la barra y sin salirse del área. Solo existe si hay proyección.
    - Color de la serie: índigo `--primary` (`#4F46E5`). Si el mark no resuelve `var(--primary)`, usar `currentColor` dentro de un contenedor `text-primary`, o la constante hex con comentario. Ningún otro color.
    - Tooltip de `@tanstack/charts/tooltip`, al pasar el cursor y al enfocar. Muestra el mes y el valor con `formatMetricValue`, y marca "Proyección" en los puntos proyectados. El punto puente **no** muestra un valor de proyección para un mes real.
    - Sin leyenda (serie única).
  - **SSR:** antes de escribir el componente, leer la guía "SSR and Hydration" y el quick start en `node_modules/@tanstack/charts/docs/`. Usar `initialWidth` si la guía lo indica para un render determinista en servidor. El componente sigue siendo hoja `"use client"`, salvo que la guía indique otra cosa; en ese caso se reporta en "Bloqueos".
- **`src/modules/admin/admin-export.ts`** (cliente; solo dibuja y escribe, sin test). Ningún import estático de `jspdf` ni de `exceljs`.
  - `downloadDashboardPdf(metrics: AdminMetrics): Promise<void>`:
    - `const { jsPDF } = await import("jspdf")`, en A4 vertical y una sola página (12 KPIs + ≤ 9 meses);
    - cabecera índigo como `downloadTicketsPdf`, con "Ticketera - Dashboard de administración" y "Generado el YYYY-MM-DD (hora de Lima)";
    - las 4 secciones de `toKpiSections` con `formatMetricValue`;
    - la tabla "Ingresos y usuarios nuevos por mes" de `buildMonthlyRows`, con columnas Mes (`label`), Ingresos, Usuarios nuevos y Tipo ("Real"/"Proyección"), y `-` para `null`;
    - texto saneado a Latin-1 con un helper local;
    - `doc.save(exportFileName("pdf"))`.
  - `downloadDashboardXlsx(metrics: AdminMetrics): Promise<void>`: `await import("exceljs")` (verificar con la doc del paquete y con `npm run build` la forma del módulo en el build de navegador, si `default` o namespace) → `Workbook` con dos hojas:
    - **"Resumen"**, con columnas Sección, Indicador y Valor y las filas de `toKpiSections`.
    - **"Mensual"**, con columnas Mes (`"YYYY-MM"`), Ingresos (S/), Usuarios nuevos y Tipo ("Real"/"Proyección") y las filas de `buildMonthlyRows`. Celda vacía para `null`.

    En las dos hojas, las celdas numéricas son **números**, no texto: los montos en soles (`cents / 100`) con `numFmt` `"S/" #,##0.00` y los conteos con `#,##0`. Al final, `workbook.xlsx.writeBuffer()` → `downloadFile(exportFileName("xlsx"), buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")`.
- **`src/modules/admin/components/ExportButtons.tsx`** (`"use client"`), con props `{ metrics: AdminMetrics }`:
  - Dos `Button variant="outline"`, "Exportar PDF" (ícono `FileText`) y "Exportar Excel" (ícono `FileSpreadsheet`). Los íconos llevan `aria-hidden`.
  - Mientras se genera un archivo, ambos quedan `disabled` y el pulsado muestra "Generando…" (patrón `try/finally` de `OrderConfirmation`).
  - Si falla, muestra un mensaje `role="alert"`: "No se pudo generar el archivo. Intenta de nuevo."
  - Altura táctil ≥ 44 px en móvil.
- **`src/components/ui/StatCard.tsx`**: componente presentacional genérico.
  - Props: `{ label: string; value: string; icon?: LucideIcon; className?: string }`.
  - Renderiza `<div><dt>…</dt><dd>…</dd></div>`; el padre debe envolverlo en `<dl>`. El ícono es decorativo (`aria-hidden`) y `className` se combina con `cn`.
  - No importa nada de `src/modules`.
- **`src/modules/admin/components/AdminDashboard.tsx`** (server component, sin `"use client"`), con props `{ metrics: AdminMetrics }`. Contiene:
  - La fila de título: "Dashboard" y un subtítulo a la izquierda, y `<ExportButtons metrics={metrics} />`. Va a la derecha en desktop (`sm:flex-row sm:justify-between`) y debajo del título en móvil.
  - Las secciones de KPIs que salen de `toKpiSections(metrics)`: "Ventas", "Eventos por estado", "Usuarios por rol" y "Moderación". Cada una es un `<section aria-labelledby>` con su `<dl>` de `StatCard`, con valores formateados por `formatMetricValue` e íconos elegidos por `key`.
  - La sección "Tendencias", después de "Ventas", con los dos `MonthlyTrendChart` en `lg:grid-cols-2` (apilados en móvil):
    - "Ingresos por mes": `variant="line"`, `unit="cents"`, `emptyMessage="Aún no hay órdenes pagadas. El gráfico aparece con los primeros pagos."` y `note="Total cobrado en órdenes pagadas, por mes de pago (hora de Lima)."`.
    - "Usuarios nuevos por mes": `variant="bar"`, `unit="count"` y `emptyMessage="No hay usuarios nuevos en los últimos 6 meses."`.
  - Los accesos directos.

Modificados:

- **`package.json`, `package-lock.json`**: `npm install @tanstack/charts@^1.1.0 exceljs@^4.4.0`.
- **`src/app/(admin)/admin/dashboard/page.tsx`**: queda `export const metadata: Metadata = { title: "Dashboard — Ticketera" }` y `export default async function AdminDashboardPage()`.
  - Hace `requireRole("admin")` → `getAdminMetrics(user)` → `<AdminDashboard metrics={…} />`.
  - Sin lógica de dominio.
  - Referencia: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`.

## Criterios de aceptación

**KPIs, permisos y ruta:**

- AC1: en `/admin/dashboard`, un `admin` o `super_admin` ve "Entradas vendidas" e "Ingresos" con los mismos valores que `getSalesSummary` para ese actor, es decir, los mismos que las tarjetas de `/organizer` para ese admin. Los conteos se formatean con `es-PE` y los montos con `formatEventPrice(…, "PEN")`.
- AC2: "Comisión de la plataforma" es `coalesce(sum(orders.platform_fee_cents), 0)` de las órdenes con `status='paid'`.
  - Sin órdenes pagadas, como antes del merge de la tarea 08, muestra `S/ 0`, sin error ni `NaN`.
  - No usa `platform_fee_percent` en ningún punto.
- AC3: "Eventos por estado" muestra siempre los 4 estados del enum, en orden draft, published, cancelled, finished, con etiquetas en español. Un estado sin eventos muestra 0, y la suma es el total de filas de `event`.
- AC4: "Usuarios por rol" muestra siempre los 4 roles con `ROLE_LABEL`, excluye usuarios con `deleted_at` no nulo y muestra 0 en los roles sin usuarios.
- AC5: "Organizadores pendientes" coincide con el total de usuarios que lista `/admin/users?role=organizer&status=pending`: organizer `pending`, rol `organizer` y usuario no borrado.
- AC6: hay dos accesos directos visibles, enfocables con teclado y con texto descriptivo:
  - "Revisar organizadores pendientes", a `/admin/users?role=organizer&status=pending`;
  - "Moderar eventos", a `/organizer`.
- AC7: fail-closed.
  - `getAdminMetrics` rechaza a `organizer` y `customer` con `Error("Forbidden")` sin llamar a ninguna función de la data-service ni a `getSalesSummary`, y acepta a `admin` y `super_admin`.
  - Además, un `customer` u `organizer` que abre `/admin/dashboard` es redirigido por el layout existente (`requireRole('admin')`).
- AC8: la página ya no muestra el placeholder. El componente default se llama `AdminDashboardPage`, el título no tiene errata y la pestaña muestra "Dashboard — Ticketera".
- AC9: las métricas y las series se calculan en cada request, sin caché: si un evento cambia de estado o se registra un usuario, recargar la página refleja el cambio en las tarjetas y en el gráfico de usuarios nuevos.
- AC10: `StatCard` es genérico. Sus props son `label`, `value`, `icon?` y `className?`, no importa nada de `src/modules`, renderiza `dt`/`dd` dentro de un `div` y se usa solo en `AdminDashboard`.

**Gráficos:**

- AC11: "Ingresos por mes" es una línea con los 6 meses que terminan en el mes en curso de Lima, cada uno con `sum(orders.total_cents)` de las órdenes `paid` cuyo `paid_at` cae en ese mes de Lima. Los meses sin órdenes valen 0.
  - Un cobro con `paid_at = 2026-11-01T03:00Z` suma en **octubre**.
  - La comisión no se grafica.
  - Las órdenes `paid` con `paid_at` nulo no aparecen.
- AC12: sin órdenes pagadas en la ventana, "Ingresos por mes" muestra exactamente "Aún no hay órdenes pagadas. El gráfico aparece con los primeros pagos.", sin ejes ni gráfico vacío.
- AC13: "Usuarios nuevos por mes" son columnas con el conteo de `user` no borrados por mes de `created_at` en Lima, en la misma ventana. Funciona sin la tarea 08.
- AC14: proyección.
  - Cuando hay al menos 2 meses con valor > 0 en la ventana, cada gráfico agrega los 3 meses siguientes, calculados con mínimos cuadrados sobre los 6 valores reales, redondeados y nunca negativos.
  - En la línea, el tramo proyectado es **discontinuo** y arranca en el último mes real. Las columnas proyectadas tienen relleno claro con contorno.
  - En ambos casos hay una etiqueta de texto visible "Proyección" sobre los meses proyectados, no solo el trazo.
  - Con menos de 2 meses con valor > 0 no hay proyección: no hay tramo discontinuo, columnas claras ni etiqueta.
- AC15: dataviz.
  - Color de la serie: índigo `--primary`.
  - Un solo eje Y, con valores formateados (`S/` para montos).
  - Grid horizontal hairline **sólido**: el trazo discontinuo solo se usa para la proyección.
  - Sin leyenda.
  - Tooltip al hover y al foco con mes, valor formateado y marca "Proyección" en los meses proyectados. El último mes real no muestra un valor de proyección.
  - Cada gráfico tiene una tabla `sr-only` con mes, valor y tipo (Real/Proyección).
- AC16: los gráficos usan `@tanstack/charts` (`Chart` de `@tanstack/charts/react`). No hay `recharts`, `@tanstack/react-charts`, `react-charts` ni `src/components/ui/chart.tsx`. Al recargar `/admin/dashboard` no hay errores de hidratación en la consola.

**Exportación:**

- AC17: hay dos botones, "Exportar PDF" (`FileText`) y "Exportar Excel" (`FileSpreadsheet`), en variante outline.
  - Van en la fila del título en desktop y debajo del título en móvil, y son enfocables con teclado.
  - Mientras se genera un archivo ambos quedan deshabilitados y el pulsado dice "Generando…".
  - Un fallo muestra un mensaje `role="alert"`.
- AC18: "Exportar PDF" descarga `ticketera-dashboard-YYYY-MM-DD.pdf`, con la fecha de hoy en Lima.
  - Contiene las 4 secciones de KPIs, con las mismas etiquetas, el mismo orden y los mismos valores formateados que la pantalla.
  - Contiene la tabla mensual de ingresos y usuarios nuevos, reales y proyectados, marcados "Real"/"Proyección".
  - Sin caracteres corruptos: solo Latin-1.
- AC19: "Exportar Excel" descarga `ticketera-dashboard-YYYY-MM-DD.xlsx`, que abre sin advertencias.
  - Hoja "Resumen": Sección, Indicador y Valor, con los 12 KPIs.
  - Hoja "Mensual": Mes `YYYY-MM`, Ingresos (S/), Usuarios nuevos y Tipo.
  - Montos y conteos son celdas **numéricas**, con los montos en soles y formato `S/`.
- AC20: la exportación no agrega rutas ni consultas: usa las métricas recibidas por props.
  - `jspdf` y `exceljs` solo se cargan con `import()` dentro del handler del clic: no hay ningún import estático de esas librerías.
  - `npm run build` (con el `.env` local del proyecto) pasa y resuelve el build de navegador de `exceljs`, sin errores de polyfills de Node.

**Estructura:**

- AC21: `page.tsx` y `AdminDashboard.tsx` son server components. Las únicas hojas `"use client"` nuevas son `MonthlyTrendChart` y `ExportButtons`, y sus props son serializables.
  - `admin-series.utils.ts`, `admin-report.ts`, `admin-export.ts` y `event-status-labels.ts` no importan valores de `@/db` ni de `@/db/schema` (solo `import type`).
- AC22: el diff solo modifica, de los archivos existentes, `src/app/(admin)/admin/dashboard/page.tsx`, `package.json` y `package-lock.json`.
  - El lockfile solo agrega `@tanstack/charts`, `exceljs` y sus dependencias transitivas, sin peers de otros frameworks.
  - No toca ningún archivo de "Coordinación con tarea 08", ni `panel-nav.ts`, `OrganizerDashboard.tsx`, `event-list-service.ts` o `ticket-export.ts`.
  - No hay migraciones ni cambios de schema.
  - `npm run lint`, `npx vitest run` y `npm run build` pasan. El build se corre con el `.env` local del proyecto: un worktree sin `.env` no es criterio de fallo.

## Tests requeridos

Vitest, con cada test junto a su archivo y el entorno `jsdom` del `vitest.config.ts`. Ningún test importa `@/db`, el cliente con conexión que ejecuta `neon(...)` al cargarse. Importar `@/db/schema` de forma transitiva es seguro: son solo definiciones de `drizzle-orm/pg-core`, sin conexión. Las etiquetas de mes se prueban con octubre y enero, que no varían entre versiones de ICU, a diferencia de setiembre (`set`/`sept`).

- **`src/modules/admin/admin-series.utils.test.ts`.**
  - `recentMonths`:
    - con `now = 2026-10-12T12:00Z` devuelve `["2026-05", …, "2026-10"]`;
    - con `now = 2026-11-01T03:00Z` (31 de octubre en Lima) termina en `"2026-10"`;
    - con `now = 2026-02-15T12:00Z` cruza el año (`"2025-09"` … `"2026-02"`).
  - `followingMonths("2026-11", 3)` da `["2026-12", "2027-01", "2027-02"]`.
  - `formatMonthLabel`: `"2026-10"` da `"oct 2026"` y `"2027-01"` da `"ene 2027"`.
  - `projectLinear(values, 3)`:
    - plana: `[10,10,10,10,10,10]` da `[10,10,10]`;
    - creciente: `[10,20,30,40,50,60]` da `[70,80,90]`;
    - decreciente que cruzaría 0: `[70,60,50,40,30,20]` da `[10,0,0]` (clamp);
    - los ceros cuentan: `[0,0,0,0,10,20]` da `[18,22,25]`;
    - un solo mes con datos: `[0,0,0,0,0,7]` da `[]`;
    - todo en 0: `[0,0,0,0,0,0]` da `[]`;
    - vacía: `[]` da `[]`.
  - `toMonthlySeries`:
    - con proyección: 6 puntos reales y 3 proyectados, con los meses siguientes, `projected` correcto y `label` en cada punto;
    - sin proyección: 6 puntos.
  - `isEmptySeries`: `true` con todos los reales en 0; `false` con un real > 0.
  - `splitForChart`:
    - con `bridge: true` y proyección, `projected` empieza con el último real (id `"<month>-bridge"`) y no se repite en `actual`;
    - con `bridge: false` no hay puente;
    - sin proyección, `projected` queda vacío.
- **`src/modules/admin/admin-metrics.utils.test.ts`.** Usa claves literales.
  - `fillByKey` con estados: si las filas solo traen `published`, `draft`, `cancelled` y `finished` quedan en 0.
  - `fillByKey` con roles: si las filas solo traen `customer`, los otros 3 roles quedan en 0.
  - `fillByKey` con meses: pone 0 en un mes sin fila e ignora un mes fuera de la ventana.
  - Filas vacías: todas las claves quedan en 0.
  - Las claves del resultado respetan el orden de `keys`.
  - Se ignora una fila con una clave fuera de `keys`.
  - `toAdminMetrics`:
    - mapea `sold` → `ticketsSold`, `revenueCents` y `platformFeeCents`;
    - rellena estados y roles y no expone `published`;
    - arma `revenueByMonth` y `newUsersByMonth` con los meses de entrada, rellenos y proyectados.
- **`src/modules/admin/admin-report.test.ts`.**
  - `formatMetricValue`:
    - `count` usa separador `es-PE`;
    - `cents` usa `S/` y convierte de centavos a soles;
    - con `compact`, un monto grande se abrevia.
  - `toKpiSections`: 4 secciones en orden (`sales`, `events`, `users`, `moderation`) con 12 ítems en total. Las etiquetas en español salen de `EVENT_STATUS_LABEL`/`ROLE_LABEL` y las unidades son correctas (ingresos y comisión en `cents`).
  - `buildMonthlyRows`:
    - une por mes en orden;
    - pone `null` en los ingresos de los meses proyectados cuando solo los usuarios proyectan;
    - `projected` es correcto.
  - `exportFileName("pdf", 2026-10-13T03:00Z)` da `"ticketera-dashboard-2026-10-12.pdf"` (fecha de Lima), y `"xlsx"` cambia la extensión.
- **`src/modules/admin/services/admin-metrics-service.test.ts`.**
  - Mocks: `vi.mock("@/modules/admin/services/admin-metrics-data-service", …)` y `vi.mock("@/modules/event/services/event-list-service", () => ({ getSalesSummary: vi.fn() }))`. Ambos módulos importan `@/db`, que ejecuta `neon(process.env.DATABASE_URL!)` al cargarse, y Vitest no carga `.env`, así que el test no debe importar `@/db` ni de forma transitiva.
  - Con `organizer` y `customer`: `getAdminMetrics` rechaza con `"Forbidden"`, y `getSalesSummary` y las **seis** funciones de la data-service **no** se llaman (`not.toHaveBeenCalled`).
  - Con `admin` y `super_admin` y un `now` fijo: devuelve el `AdminMetrics` mapeado a partir de los mocks, con relleno de ceros y las series en los 6 meses de ese `now` incluidos, y `getSalesSummary` recibe el `actor`.
- **Sin test:**
  - `StatCard.tsx`, `AdminDashboard.tsx`, `MonthlyTrendChart.tsx` y `ExportButtons.tsx`, porque son presentacionales. Su lógica vive en los helpers probados (SETUP §3).
  - `admin-export.ts`, porque solo dibuja el PDF y escribe el xlsx. Es el mismo criterio que `downloadTicketsPdf`: las partes puras están en `admin-report.ts`.
  - `admin-metrics-data-service.ts`, porque son consultas a la DB. Es el mismo criterio que `organizer-dashboard-real-data.md`: no se mockea Drizzle.

## Tareas

### T0 — Dependencias base
- Archivos: `package.json`, `package-lock.json`
- Acción: `npm install "@tanstack/charts@^1.1.0" "exceljs@^4.4.0"` (con comillas: en zsh un `^` suelto puede activar el glob extendido).
  - No correr `npx shadcn add chart` ni instalar `recharts`, `@tanstack/react-charts`, `react-charts` o `xlsx`.
  - Verificar en el lockfile que no entraron peers de otros frameworks (son opcionales) y correr `npm audit --omit=dev`. Los advisories altos de `exceljs` o de sus dependencias se reportan en "Bloqueos" y no bloquean.
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC16, AC20, AC22 (parte de dependencias)

### T1 — Contrato, etiquetas y helpers puros
- Archivos: `src/modules/admin/admin-metrics.types.ts`, `src/modules/admin/admin-series.utils.ts`, `src/modules/admin/admin-series.utils.test.ts`, `src/modules/admin/admin-metrics.utils.ts`, `src/modules/admin/admin-metrics.utils.test.ts`, `src/modules/admin/admin-report.ts`, `src/modules/admin/admin-report.test.ts`, `src/modules/event/components/event-status-labels.ts`
- Depende de: —
- Paralelizable: sí (con T0)
- Cubre: AC3, AC4, AC11, AC14, AC18, AC19, AC21 (helpers)

### T2 — Service de métricas con guard fail-closed
- Archivos: `src/modules/admin/services/admin-metrics-data-service.ts`, `src/modules/admin/services/admin-metrics-service.ts`, `src/modules/admin/services/admin-metrics-service.test.ts`
- Depende de: T1
- Paralelizable: sí (con T3)
- Cubre: AC1, AC2, AC3, AC4, AC5, AC7, AC9, AC11, AC13

### T3 — Hojas cliente: gráfico mensual y exportación
- Archivos: `src/modules/admin/components/MonthlyTrendChart.tsx`, `src/modules/admin/admin-export.ts`, `src/modules/admin/components/ExportButtons.tsx`
- Antes de escribir `MonthlyTrendChart`, leer la doc instalada de `@tanstack/charts` (README, `llms.txt`, quick start y guía "SSR and Hydration").
- Depende de: T0, T1
- Paralelizable: sí (con T2)
- Cubre: AC12, AC14, AC15, AC16, AC17, AC18, AC19, AC20, AC21

### T4 — StatCard, dashboard admin y ruta
- Archivos: `src/components/ui/StatCard.tsx`, `src/modules/admin/components/AdminDashboard.tsx`, `src/app/(admin)/admin/dashboard/page.tsx`
- Depende de: T1, T2, T3
- Paralelizable: no
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6, AC8, AC9, AC10, AC12, AC13, AC17, AC21, AC22

## Preguntas abiertas

1. **¿Pasamos también las tarjetas a (b) para que cuadren con el gráfico?** Hoy las tarjetas usan (a), el inventario vía `getSalesSummary`, y el gráfico de ingresos usa (b), `orders`. Por eso Σ de los meses ≠ "Ingresos".
   - (b) en las tarjetas sería:
     - entradas = `count(order_item)` de órdenes pagadas (hay una fila por entrada, porque `toOrderItems` expande la cantidad);
     - ingresos = `sum(orders.total_cents)`;
     - comisión = `sum(orders.platform_fee_cents)`.
   - Ingresos, comisión y gráfico serían coherentes entre sí, pero las tarjetas se desalinearían de `/organizer` y mostrarían 0 hasta el merge de la tarea 08.
   - La solución de fondo es migrar `getSalesSummary` a órdenes después de las tareas 08 y 12, pero eso toca `event-list-service.ts`. ¿Lo dejamos como próxima fase?
2. **¿"Ventas" cuenta entradas u órdenes?** Por defecto, entradas vendidas, igual que `/organizer`. ¿Agregamos también la tarjeta "Órdenes pagadas" (`count(*) from orders where status='paid'`)?
3. **¿Mostramos también órdenes `pending` o `failed`** (embudo de pago, abandono)? Por defecto no (YAGNI).
4. **Organizadores pendientes:**
   - ¿Excluimos los que tienen el usuario borrado? Por defecto sí, para que coincida con el listado del acceso directo.
   - Hoy ningún flujo de la app crea organizadores `pending`: la promoción por admin los deja `approved` y `updateUser` excluye `pending`. Este KPI será normalmente 0 hasta que exista una solicitud de organizador.
   - Si esa solicitud futura mantiene `role='customer'` mientras está pendiente, el filtro `role='organizer'` (y también el listado de `/admin/users`) la ocultaría. ¿Cómo debe modelarse?
5. **Reembolsos (tarea 12).** ¿La comisión y el gráfico de ingresos deben incluir las órdenes `partially_refunded`, descontando lo devuelto? Por defecto solo cuentan `paid`.
6. **Precisión de montos.** `formatEventPrice` redondea a soles enteros (`maximumFractionDigits: 0`), así que una comisión de S/ 4.50 se muestra como S/ 5 en pantalla y en el PDF, mientras el Excel guarda S/ 4.50 con dos decimales. ¿Mostramos céntimos en pantalla y en el PDF?
7. **Refactor de `OrganizerDashboard`** para usar `StatCard`, y de `OrganizerEventRow`/`OrganizerEventFilters` para usar `EVENT_STATUS_LABEL` y eliminar el `STATUS_LABEL` local. ¿Va en la próxima fase?
8. **Otro acceso directo.** ¿Agregamos uno a `/admin/users?role=organizer` (todos los organizadores, para suspender), además del de pendientes?
9. **¿Los gráficos van como imagen en el PDF?** Por defecto no: el PDF lleva KPIs y tablas. Si se quiere, `@tanstack/charts/export` ofrece exportar a SVG o raster en el navegador, y la imagen se insertaría con `doc.addImage`.
10. **¿Qué meses entran en la regresión?** Por defecto entran los 6 de la ventana, incluido el **mes en curso parcial**, que tira la tendencia hacia abajo a inicios de mes, y los meses en 0 previos a la primera actividad, que la empujan hacia arriba. ¿Excluimos el mes en curso de la regresión (proyectando desde el último mes completo) o recortamos los ceros iniciales?
11. **¿Rango de meses configurable?** Por defecto la ventana es fija: 6 meses reales + 3 proyectados, en pantalla y en la exportación. ¿Hace falta un selector (3/6/12 meses) o exportar un rango distinto del que se ve?
12. **Madurez de `@tanstack/charts`.** La 1.0 salió hace 9 días (1.1.0 el 2026-10-09). Se fija `^1.1.0` y se valida contra la doc instalada. ¿Preferimos fijar la versión exacta (`1.1.0`) hasta que la librería se estabilice, para que un minor no cambie la API bajo nuestros pies?

## Próximas fases

- Pasar `getSalesSummary` (y con eso `/organizer` y las tarjetas de este dashboard) a órdenes pagadas y descontar reembolsos, cuando las tareas 08 y 12 estén mergeadas.
- Refactor de `OrganizerDashboard.tsx` para usar `StatCard`, y de `OrganizerEventRow`/`OrganizerEventFilters` para usar `EVENT_STATUS_LABEL`.
- Mover `downloadFile`/`toFileName` de `src/modules/booking/ticket-export.ts` a `src/lib`, porque ya los usan dos módulos.
- Proyección con estacionalidad (Holt-Winters) cuando haya más de 12 meses de historia, y rango de meses configurable.
- Gráficos como imagen en el PDF (`@tanstack/charts/export`).
- Acotar por fecha las consultas mensuales cuando `orders` y `user` crezcan.
- Agrupar montos por moneda si aparece una segunda moneda.
- Filtros por fecha u organizador.
- Embudo de pagos (órdenes `pending`/`failed`) y métricas de reembolsos.
