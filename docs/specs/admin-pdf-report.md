# Reporte PDF del dashboard admin: 3 páginas A4 con gráficos y resumen ejecutivo

Estado: aprobada

## Objetivo

Hoy `downloadDashboardPdf(metrics)` (`src/modules/admin/admin-export.ts`) genera **una sola página** A4: una banda índigo, los KPIs en texto y una tabla mensual. Esta spec la reemplaza por un **reporte A4 de 3 páginas**, según el mockup que aprobó el humano:

1. **Resumen ejecutivo**: tarjetas de ventas, 5 hallazgos generados con plantilla (sin IA) y la proyección del próximo trimestre.
2. **Tendencias**: los gráficos "Ingresos por mes" (línea) e "Usuarios nuevos por mes" (barras), dibujados como vectores con su proyección y una tabla mensual.
3. **Detalle**: tarjetas de eventos, usuarios y moderación, y las notas de metodología.

Los datos son los mismos `AdminMetrics` que ya calcula el servidor. No hay consultas nuevas ni se recalcula nada por otro camino. Las definiciones que resumen las viñetas de metodología vienen de la spec base `docs/specs/admin-dashboard-metrics.md`, sección **"Definición de métricas"**. No aplica ninguna sección de `docs/architecture/` y no se usa ninguna API de Next.js: todo es código cliente con `jspdf`.

## Decisiones

Están tomadas y no se reabren en esta spec.

1. **Gráficos vectoriales con `jspdf`.** Se dibujan con `line`, `lines`, `rect`, `roundedRect`, `circle`, `setLineDashPattern` y `text`. **No** se rasteriza el chart de TanStack. La geometría (ticks, escalas, x/y de cada punto, rectángulos de barra y de franja) vive en funciones puras con tests (T2), separadas del dibujo (T3).
2. **Fuente Helvetica** (la base de jsPDF). No se incrusta Poppins (YAGNI; ver Preguntas abiertas). **`pdfText` no cambia**: solo se mueve de archivo.
3. **Latin-1 por texto, no por código.** `pdfText` borra lo que no sea Latin-1, así que los textos literales de esta spec no usan "…", "→", "≥", "•" ni comillas tipográficas. Sí usan "·", tildes y "ñ", que son Latin-1. No se agrega `…`→`...` a `pdfText`. Las viñetas se dibujan con `circle()` (o un guion "-"), nunca con "•".
4. **Resumen ejecutivo por plantilla**: `buildExecutiveSummary(metrics)` es una función pura. Toma los meses reales y proyectados que ya traen `metrics.revenueByMonth` y `metrics.newUsersByMonth` (campo `projected`). No llama a `projectLinear` ni vuelve a calcular series.
5. **Comparación mensual (default, sujeto a la Pregunta abierta 2).** Los hallazgos (1) y (3) comparan el **último mes real** (el mes en curso de Lima, parcial) con el anterior, y el texto lo rotula como "(mes en curso, parcial)".
6. **Las dos series son independientes en todo.** Ingresos puede estar vacía mientras usuarios tiene proyección, o al revés. Las reglas de la página 2 (franja, trazo discontinuo, leyenda, columnas de la tabla, rótulos) y cada línea del recuadro "Proyección próximo trimestre" se evalúan **por serie**. El hallazgo (2) depende solo de ingresos.
7. **Dos archivos para el PDF** (los dos son de T3):
   - `admin-export.ts` queda como fachada de descarga: `downloadDashboardPdf` crea `now`, construye el documento y llama a `save`. `downloadDashboardXlsx` queda intacto.
   - `admin-pdf-draw.ts` contiene `buildDashboardPdf(metrics, now)`, que devuelve el documento **sin** `save`, más `pdfText` y los helpers de dibujo.

   Se separan por responsabilidad: descargar no es lo mismo que dibujar. Así el archivo xlsx no crece a unas 450 líneas, y el builder se puede probar en Vitest sin disparar una descarga.
8. **Tipos junto a su función.** `ExecutiveFinding`, `SummaryCard`, `ProjectionTotal` (T1) y `PlotFrame`, `Rect` (T2) se exportan desde su propio archivo, **no** desde `admin-metrics.types.ts`. Si T1 y T2 tocaran ese archivo, tendría dos dueños y haría falta un T0. Hay precedente en el repo: `event-list.utils.ts` exporta `ZoneSales`/`EventSales` y `venue-map.utils.ts` también exporta tipos propios.
9. **Textos vacíos copiados, no importados.** Los `emptyMessage` de los gráficos están inline en el JSX de `AdminDashboard.tsx`, que no se toca. T1 los copia literalmente en `EMPTY_SERIES_TEXT`, con un comentario que indica de dónde vienen. Pasarlos a una constante compartida queda para Próximas fases.
10. **Fechas en ISO**: `toLimaDate` (`2026-10-12`) + `toLimaTime` (`14:05`), igual que el nombre del archivo (sujeto a la Pregunta abierta 3).
11. **El eje X es la tabla.** El gráfico no dibuja etiquetas de mes propias. La fila de cabecera de la tabla, justo debajo del área de trazado y con las mismas columnas, hace de eje X.
12. **Sin dependencias nuevas.** `jspdf` se sigue cargando con `import()` dinámico dentro de `buildDashboardPdf`; los demás archivos solo usan `import type` de `jspdf`.

### Medidas y colores (para T3)

| Elemento | Valor |
|---|---|
| Página | A4 vertical, `new jsPDF({ unit: "mm", format: "a4" })` (210 × 297 mm), **sin** `compress` |
| Conversión del mockup | `PX = 210 / 794` mm por px de diseño (≈ 0.2645) |
| Margen lateral | 72 px ≈ **19 mm** → ancho útil 172 mm |
| Barra superior | `#4F46E5`, alto 6 px ≈ 1.6 mm, todo el ancho, en `y = 0` |
| Separador del encabezado | línea `#d4d4d4` |
| Índigo (marca, serie real) | `#4F46E5` |
| Franja de proyección y celdas proyectadas | `#f4f4f5` |
| Barra proyectada | relleno `#e0e7ff` + borde índigo discontinuo |
| Recuadro "Proyección próximo trimestre" | relleno `#eef2ff`, borde `#c7d2fe` |
| Etiqueta "Requiere atención" | relleno `#fef3c7`, texto `#78350f` |
| Texto principal / secundario | `#18181b` / `#52525b` |
| Grilla | `#e4e4e7`, sólida |
| Trazo mínimo | `setLineWidth(0.3)` (mm). Serie de línea: 0.6 mm. El default de jsPDF (0.2 mm < 1 px) **no** se usa |
| Patrón discontinuo | `setLineDashPattern([1.6, 1.1], 0)`, que se resetea con `setLineDashPattern([], 0)` después de cada uso |
| Tipografía | Helvetica. h1 22 pt bold; título de página 14 pt bold; valor de tarjeta 18 pt bold; cuerpo 10 pt; texto chico **9 pt (mínimo absoluto)** |
| Gráfico y tabla | columna de etiqueta 28 mm; área de trazado `left = 19 + 28 = 47`, `width = 144`; alto de trazado ≈ 60 mm |

Las posiciones verticales exactas quedan a criterio del developer, siempre que nada se solape y todo quepa dentro de la página entre el encabezado y el pie.

## Alcance

- Incluye:
  - Textos puros de la página 1 (T1): resumen ejecutivo, metadatos, tarjetas, recuadro de proyección y textos de serie vacía.
  - Geometría pura de los gráficos (T2).
  - Dibujo de las 3 páginas y el smoke test (T3).
  - Mover `pdfText` de `admin-export.ts` a `admin-pdf-draw.ts`, sin cambiarlo.
- No incluye:
  - **Excel**: `downloadDashboardXlsx` no cambia.
  - **`ExportButtons.tsx`**: no cambia; sigue llamando `downloadDashboardPdf(metrics)`.
  - **UI del dashboard**: `AdminDashboard.tsx`, `MonthlyTrendChart.tsx` y la ruta no cambian.
  - **Poppins** ni ninguna otra fuente TTF incrustada.
  - **Cambios fuera de `src/modules/admin/**`**. En particular, `src/modules/booking/ticket-export.ts` y `src/modules/event/**` no se tocan.
  - Cambios en `admin-report.ts`, `admin-series.utils.ts`, `admin-metrics.types.ts` y el service de métricas.
  - Nuevas métricas, consultas o dependencias.

## Reutilizar

| Qué | Dónde | Uso |
|---|---|---|
| `formatMetricValue(value, unit, { compact })` | `src/modules/admin/admin-report.ts` | Todo monto y conteo del PDF. Los ticks del eje Y y el desborde de la tabla usan `compact: true` |
| `toKpiSections(metrics)` | `src/modules/admin/admin-report.ts` | Sección `sales`: etiquetas y valores de las 3 tarjetas de la página 1 (T1). Secciones `events`, `users` y `moderation`: tarjetas de la página 3 (T3) |
| `exportFileName("pdf", now)` | `src/modules/admin/admin-report.ts` | Nombre del archivo, con el mismo `now` del documento |
| `isEmptySeries(points)` | `src/modules/admin/admin-series.utils.ts` | Decide si una serie no tiene datos (T1, hallazgos; T3, figura vacía) |
| `splitForChart(points, { bridge: true })` | `src/modules/admin/admin-series.utils.ts` | Línea: el tramo discontinuo empieza en el último real. Columna de `actual[i]` = `i`; columna de `projected[j]` = `actual.length - 1 + j` |
| `MonthlyPoint`, `AdminMetrics`, `MetricUnit` | `src/modules/admin/admin-metrics.types.ts` | Tipos de entrada |
| `toLimaDate(now)`, `toLimaTime(now)` | `src/modules/event/event-list.utils.ts` | Fecha (`YYYY-MM-DD`) y hora (`HH:mm`) de Lima |
| `pdfText` | hoy en `admin-export.ts` | Se mueve sin cambios a `admin-pdf-draw.ts`. Todo `doc.text` pasa por él |
| `emptyMessage` de los gráficos | `AdminDashboard.tsx` (líneas del JSX) | Se copian literalmente en `EMPTY_SERIES_TEXT` (Decisión 9) |

`buildMonthlyRows` **no** se usa en el PDF, porque cada figura tiene su propia tabla por serie con una columna por mes; lo sigue usando el Excel.

No hay componentes shadcn involucrados. No existe en el repo ningún helper de porcentajes ni de ticks "nice": lo busqué en `src/modules`, `src/lib` y `src/hooks`.

## Archivos

| Archivo | Acción | Tarea | Contenido |
|---|---|---|---|
| `src/modules/admin/admin-executive-summary.ts` | nuevo | T1 | `ExecutiveFinding`, `SummaryCard`, `ProjectionTotal`, `EMPTY_SERIES_TEXT`, `formatPercentChange`, `buildExecutiveSummary`, `buildReportMeta`, `buildSummaryCards`, `buildProjectionTotals` |
| `src/modules/admin/admin-executive-summary.test.ts` | nuevo | T1 | Tests de lo anterior |
| `src/modules/admin/admin-pdf-chart.utils.ts` | nuevo | T2 | `PlotFrame`, `Rect`, `niceTicks`, `scaleY`, `columnCenterX`, `barRect`, `projectionBandRect` |
| `src/modules/admin/admin-pdf-chart.utils.test.ts` | nuevo | T2 | Tests de lo anterior |
| `src/modules/admin/admin-pdf-draw.ts` | nuevo | T3 | `buildDashboardPdf(metrics, now)`, `pdfText` (movido), helpers de dibujo privados y textos literales de las páginas 2 y 3 |
| `src/modules/admin/admin-pdf-draw.test.ts` | nuevo | T3 | Smoke test del builder |
| `src/modules/admin/admin-export.ts` | modificado | T3 | `downloadDashboardPdf` pasa a ser fachada; se quitan el dibujo viejo y `pdfText`; xlsx intacto |

### Firmas (T1, `admin-executive-summary.ts`)

```ts
export interface ExecutiveFinding { title: string; text: string; attention?: boolean }
export interface SummaryCard { label: string; value: string; detail: string }
export interface ProjectionTotal { label: string; value: string; detail: string }

export const EMPTY_SERIES_TEXT: { revenue: string; newUsers: string };
export function formatPercentChange(current: number, previous: number): string | null;
export function buildExecutiveSummary(metrics: AdminMetrics): ExecutiveFinding[]; // siempre 5
export function buildReportMeta(metrics: AdminMetrics, now: Date): { headerLabel: string; metaLine: string };
export function buildSummaryCards(metrics: AdminMetrics): SummaryCard[];          // siempre 3
export function buildProjectionTotals(metrics: AdminMetrics): ProjectionTotal[];  // [ingresos, usuarios nuevos]
```

### Firmas (T2, `admin-pdf-chart.utils.ts`)

```ts
export interface PlotFrame { left: number; top: number; width: number; height: number }
export interface Rect { x: number; y: number; width: number; height: number }

export function niceTicks(max: number, options: { minStep: number; count?: number }): number[]; // count = 5
export function scaleY(value: number, domainMax: number, frame: PlotFrame): number;
export function columnCenterX(index: number, count: number, frame: PlotFrame): number;
export function barRect(index: number, count: number, value: number, domainMax: number, frame: PlotFrame): Rect;
export function projectionBandRect(points: MonthlyPoint[], frame: PlotFrame): Rect | null;
```

### Firmas (T3)

```ts
// admin-pdf-draw.ts
import type { jsPDF } from "jspdf";
export async function buildDashboardPdf(metrics: AdminMetrics, now: Date): Promise<jsPDF>;

// admin-export.ts (misma firma que hoy)
export async function downloadDashboardPdf(metrics: AdminMetrics): Promise<void>;
```

## Textos literales

Se copian **exactos**. `{...}` es un valor interpolado. Los montos y conteos se formatean con `formatMetricValue`; `{cur}` y `{prev}` son el `label` del último y el penúltimo punto real (`"oct 2026"`), y `{lastProj}` el `label` del último punto proyectado.

### T1: hallazgos del resumen ejecutivo (en este orden)

| # | `title` | Condición | `text` |
|---|---|---|---|
| 1 | `Ingresos del mes` | `isEmptySeries(revenueByMonth)` | `Aún no hay ventas registradas: no hay órdenes pagadas en los últimos 6 meses.` |
| | | `prev > 0` | `Ingresos de {cur} (mes en curso, parcial): {monto}, {pct} ({delta}) frente a {prev}.` |
| | | `prev = 0` y `cur > 0` | `Ingresos de {cur} (mes en curso, parcial): {monto}. En {prev} no hubo ingresos, así que no se calcula la variación.` |
| | | `prev = 0` y `cur = 0` | `Ingresos de {cur} (mes en curso, parcial): {monto}. En {prev} tampoco hubo ingresos.` |
| 2 | `Proyección de ingresos` | `revenueByMonth` tiene puntos `projected` | `Si se mantiene la tendencia, {lastProj} cerraría con {monto del último proyectado} de ingresos.` |
| | | sin puntos proyectados | `Sin proyección: se necesitan al menos 2 meses con ingresos en los últimos 6.` |
| 3 | `Usuarios nuevos` | `isEmptySeries(newUsersByMonth)` | `EMPTY_SERIES_TEXT.newUsers` (sin sufijo) |
| | | `prev > 0` | `Usuarios nuevos de {cur} (mes en curso, parcial): {n}, {pct} frente a {prev}.` + sufijo |
| | | `prev = 0` y `cur > 0` | `Usuarios nuevos de {cur} (mes en curso, parcial): {n}. En {prev} no hubo registros, así que no se calcula la variación.` + sufijo |
| | | `prev = 0` y `cur = 0` | `Usuarios nuevos de {cur} (mes en curso, parcial): {n}. En {prev} tampoco hubo registros.` + sufijo |
| | | sufijo con proyección | ` Proyección para {lastProj}: {n del último proyectado}.` |
| | | sufijo sin proyección | ` Sin proyección: se necesitan al menos 2 meses con registros.` |
| 4 | `Catálogo de eventos` | siempre | `Publicados: {published} · Borradores: {draft} · Finalizados: {finished} · Cancelados: {cancelled}.` |
| 5 | `Organizadores pendientes` | `pendingOrganizers > 0` | `Solicitudes de organizador por revisar: {n}.`, con `attention: true` |
| | | `pendingOrganizers = 0` | `No hay solicitudes de organizador por revisar.` (sin `attention`) |

- `{pct}` = `formatPercentChange(cur, prev)`: `Intl.NumberFormat("es-PE", { maximumFractionDigits: 1, signDisplay: "exceptZero" })` sobre `(cur - prev) / prev * 100`, seguido de `" %"` (espacio ASCII). Da como máximo 1 decimal y no agrega `.0`. Ejemplos: `+12.5 %`, `-3 %`, `0 %` (sin signo, nunca `-0`), `-100 %`, `-33.3 %`. Devuelve `null` si `previous === 0`.
- `{delta}` = la diferencia en S/ con signo explícito: `"+"` o `"-"` + `formatMetricValue(Math.abs(cur - prev), "cents")`, por ejemplo `+S/ 137` o `-S/ 137`. El signo se decide sobre el monto ya redondeado al sol (`Math.round(Math.abs(delta) / 100)`): si redondea a 0, va sin signo (`S/ 0`).
- Precondición: una serie no vacía trae al menos 2 puntos reales (la spec base garantiza 6). `[]` cuenta como vacía (`isEmptySeries([])` es `true`).

### T1: metadatos, tarjetas, proyección y textos vacíos

- `buildReportMeta(metrics, now)`:
  - `headerLabel` = `Reporte de métricas · {toLimaDate(now)}`, por ejemplo `Reporte de métricas · 2026-10-12`.
  - `metaLine` = `Generado el {toLimaDate(now)}, {toLimaTime(now)} (hora de Lima) · Tendencias de {primer real} a {último real}`. Los meses son los `label` de los puntos **reales** de `revenueByMonth`. Si no hay puntos reales, `metaLine` termina en `(hora de Lima)`.
  - Ejemplo: con `now = 2026-10-12T19:05:00Z` y reales de may a oct 2026, da `Generado el 2026-10-12, 14:05 (hora de Lima) · Tendencias de may 2026 a oct 2026`.
- `buildSummaryCards(metrics)`: en este orden, `label` y valor salen de la sección `sales` de `toKpiSections`, y `value` = `formatMetricValue(item.value, item.unit)`. Cada `detail` describe **solo su propia fuente**; no puede haber "X % de los ingresos" ni ninguna cifra que cruce fuentes:
  1. `Ingresos`: `Valor de las entradas vendidas en eventos publicados y finalizados.`
  2. `Entradas vendidas`: `Zonas generales y asientos numerados de eventos publicados y finalizados.`
  3. `Comisión de la plataforma`: `Suma de la comisión guardada en las órdenes pagadas.`
- `buildProjectionTotals(metrics)` devuelve una línea por serie, independientes entre sí:
  - Con puntos proyectados: `{ label, value: formatMetricValue(suma de los proyectados, unit), detail: "Suma de {primer proyectado} a {último proyectado}" }`.
  - Sin puntos proyectados: `{ label, value: "Sin proyección", detail }`, con el `detail` de la tabla:

  | `label` | `detail` sin proyección |
  |---|---|
  | `Ingresos proyectados` | `Se necesitan al menos 2 meses con ingresos` |
  | `Usuarios nuevos proyectados` | `Se necesitan al menos 2 meses con registros` |
- `EMPTY_SERIES_TEXT`, copia literal de `AdminDashboard.tsx`:
  - `revenue`: `Aún no hay órdenes pagadas. El gráfico aparece con los primeros pagos.`
  - `newUsers`: `No hay usuarios nuevos en los últimos 6 meses.`

### T3: textos fijos de las páginas

- Encabezado: `Ticketera` (izquierda) y `headerLabel` (derecha).
- Pie: `Uso interno · Generado desde el panel de administración` (izquierda) y `Página {n} de 3` (derecha).
- Página 1:
  - `REPORTE DE ADMINISTRACIÓN` (antetítulo), `Métricas de la plataforma` (h1) y `metaLine`.
  - `Resumen ejecutivo`, `Requiere atención` y `Proyección próximo trimestre`.
- Página 2:
  - `Tendencias`, `Ingresos por mes` y `Usuarios nuevos por mes`.
  - Leyenda: `Real` y `Proyección`; franja: `Proyección`.
  - Tabla: cabecera `Mes`; filas `Ingresos` y `Usuarios nuevos`.
  - Nota al pie: `* Proyección por tendencia lineal (mínimos cuadrados) sobre los últimos 6 meses reales. Es una estimación; ver Notas y metodología en la página 3.`
- Página 3:
  - `Detalle`, con los títulos de sección de `toKpiSections` (`Eventos por estado`, `Usuarios por rol`, `Moderación`).
  - Texto de la tarjeta de moderación: `Solicitudes de organizador que esperan aprobación.`
  - `Notas y metodología`, con estas 5 viñetas en orden:
    1. `Tarjetas de Ingresos y Entradas vendidas: salen del inventario (entradas vendidas en zonas generales y asientos vendidos en zonas numeradas, por el precio de su zona), solo en eventos publicados y finalizados.`
    2. `Gráfico de ingresos: suma lo cobrado en órdenes pagadas, agrupado por mes de pago en hora de Lima. No coincide con la tarjeta Ingresos porque mide otra cosa (cobros, no inventario vendido) y solo cubre los últimos 6 meses.`
    3. `Comisión de la plataforma: suma la comisión guardada en cada orden pagada al momento del cobro; no se recalcula con el porcentaje vigente.`
    4. `Proyección: tendencia lineal por mínimos cuadrados sobre los 6 meses reales (los meses sin datos cuentan como 0), redondeada y nunca menor que 0, para los 3 meses siguientes. No considera estacionalidad y solo se calcula si hay al menos 2 meses con valores mayores que 0.`
    5. `Montos: se asume una sola moneda, soles (PEN), redondeados al sol y sin decimales. Las fechas y los meses usan la hora de Lima.`

## Criterios de aceptación

### Generales

- AC1: `downloadDashboardPdf(metrics)` mantiene su firma. Crea **un solo** `now = new Date()`, hace `const doc = await buildDashboardPdf(metrics, now)` y luego `doc.save(exportFileName("pdf", now))`. `git diff` no muestra cambios en `downloadDashboardXlsx`, `ExportButtons.tsx`, `AdminDashboard.tsx` ni `MonthlyTrendChart.tsx`, ni fuera de `src/modules/admin/**`.
- AC2: `buildDashboardPdf` crea un `jsPDF({ unit: "mm", format: "a4" })` vertical, sin `compress`, y el documento tiene **exactamente 3 páginas** con cualquier dato: series vacías, con o sin proyección, 0 o N organizadores pendientes.
- AC3: Cada página tiene:
  - la barra índigo `#4F46E5` de ≈1.6 mm arriba, a todo el ancho;
  - el encabezado: cuadrado índigo de logo, `Ticketera` a la izquierda y `headerLabel` a la derecha, separados del contenido por una línea `#d4d4d4`;
  - el pie: `Uso interno · Generado desde el panel de administración` a la izquierda y `Página X de 3` a la derecha.

  El contenido respeta los márgenes laterales de 19 mm. El encabezado y el pie se dibujan con un solo helper (DRY).
- AC4: Accesibilidad visual:
  - ningún texto mide menos de 9 pt, incluidos los ticks, la tabla, el pie y las etiquetas;
  - toda línea o borde se dibuja después de un `setLineWidth` ≥ 0.3 mm;
  - la proyección se distingue **sin color**: con franja, trazo discontinuo y punto o barra hueca con borde discontinuo;
  - el texto siempre es oscuro sobre fondo claro, salvo el blanco sobre índigo.
- AC5: Todo `doc.text` recibe texto pasado por `pdfText`. `pdfText` es idéntico al de hoy. Los literales del código coinciden con "Textos literales" y ninguno contiene `…`, `→`, `≥`, `•` ni comillas tipográficas. Las viñetas se dibujan con `circle()` o con "-".
- AC6: `jspdf` solo se importa con `await import("jspdf")` dentro de `buildDashboardPdf`. Los demás imports de `jspdf` son `import type`.

### Página 1: Resumen ejecutivo

- AC7: Muestra el antetítulo `REPORTE DE ADMINISTRACIÓN` (9 pt, bold, índigo), el h1 `Métricas de la plataforma` y debajo `metaLine` de `buildReportMeta(metrics, now)`.
- AC8: Hay 3 tarjetas con borde, en una fila, con `label`, `value` y `detail` de `buildSummaryCards` en ese orden. El `detail` se ajusta al ancho de la tarjeta con `splitTextToSize` y las 3 tarjetas tienen el mismo alto.
- AC9: Bajo el título `Resumen ejecutivo` van los 5 hallazgos de `buildExecutiveSummary`, numerados del 1 al 5: `title` en bold y `text` en normal, ajustado al ancho útil. La etiqueta `Requiere atención` (relleno `#fef3c7`, texto `#78350f`) aparece **solo** junto al hallazgo con `attention: true`.
- AC10: El recuadro `Proyección próximo trimestre` (relleno `#eef2ff`) muestra las 2 entradas de `buildProjectionTotals`, cada una con su `label`, `value` y `detail`.

### Textos puros (T1)

- AC11: `buildReportMeta` devuelve exactamente los formatos de "Textos literales", con fecha y hora de Lima por `toLimaDate`/`toLimaTime`.
- AC12: `formatPercentChange` cumple el formato fijado: `+12.5 %`, `-3 %`, `0 %`, `null` cuando el anterior es 0.
- AC13: `buildExecutiveSummary` devuelve siempre 5 hallazgos, en orden, con los títulos y las ramas exactas de la tabla. Los montos salen de `formatMetricValue` y los meses de `point.label`. No llama a `projectLinear` ni a `toMonthlySeries`.
- AC14: `buildSummaryCards` devuelve 3 tarjetas con los `detail` literales, sin cifras que crucen fuentes.
- AC15: `buildProjectionTotals` suma solo los puntos `projected` de cada serie, y cada serie tiene su propia frase cuando no hay proyección.
- AC16: Toda cadena que devuelven las funciones de T1 usa solo caracteres U+0020–U+00FF. El espacio duro U+00A0 que pone ICU es Latin-1 y `pdfText` lo normaliza.

### Página 2: Tendencias (cada regla se evalúa por figura)

- AC17: Bajo el título `Tendencias` van dos figuras: `Ingresos por mes` (línea, `cents`) y `Usuarios nuevos por mes` (barras, `count`). Cada una tiene título, leyenda arriba a la derecha, área de trazado y tabla debajo.
- AC18: Eje Y:
  - `ticks = niceTicks(max, { minStep })`, donde `max` es el máximo de **todos** los puntos de la serie, reales y proyectados (igual que `MonthlyTrendChart`), con `minStep` = 100 para `cents` (S/ 1) y 1 para `count`; el dominio es `[0, último tick]`;
  - en cada tick, una línea de grilla **sólida** `#e4e4e7` y una etiqueta `formatMetricValue(tick, unit, { compact: true })` de 9 pt, alineada a la derecha dentro de la columna de etiqueta.
- AC19: Con proyección:
  - la franja `#f4f4f5` (`projectionBandRect`) va dibujada **detrás** de la grilla y la serie, con el rótulo `Proyección` (9 pt, `#52525b`) arriba dentro de la franja;
  - línea: tramo real sólido índigo de 0.6 mm con puntos rellenos, y tramo proyectado **discontinuo** desde el último real (`splitForChart` con `bridge: true`) con puntos huecos en los meses proyectados. El dato puente (id que termina en `-bridge`) **no** lleva marcador, así el último real conserva su punto relleno;
  - barras: las reales con relleno índigo y las proyectadas con relleno `#e0e7ff` y borde índigo discontinuo;
  - leyenda `Real` + `Proyección`, cada una con su muestra (trazo o relleno);
  - rótulos directos (9 pt, bold, `formatMetricValue` completo) sobre el **último real** y el **último proyectado**.
- AC20: Sin proyección: sin franja, sin trazo discontinuo, leyenda solo `Real` y un rótulo directo solo en el último real. La tabla tiene 7 columnas: etiqueta + 6 meses.
- AC21: Serie vacía (`isEmptySeries`): en el área de trazado va el mensaje `EMPTY_SERIES_TEXT.revenue` o `.newUsers`, centrado, sin ejes, grilla, leyenda ni marcas. Se dibuja con una sola llamada a `doc.text`, sin `splitTextToSize` ni `maxWidth`: a 10 pt el mensaje de ingresos mide unos 114 mm y cabe en los 144 mm del área. La tabla se dibuja igual, con los meses reales en 0.
- AC22: Tabla de cada figura:
  - columna de etiqueta de 28 mm y una columna por punto, centrada en `columnCenterX(i, points.length, frame)` (el mismo frame del gráfico), así cada mes queda alineado con su marca;
  - fila de cabecera `Mes` + `label`, con `*` al final del label proyectado, por ejemplo `ene 2027*`; fila de valores `Ingresos` o `Usuarios nuevos` + `formatMetricValue(value, unit)`;
  - las celdas proyectadas, de las dos filas, van sombreadas `#f4f4f5`;
  - si `getTextWidth` de un valor supera el ancho de su columna menos 1 mm, ese valor usa `{ compact: true }`;
  - todo en 9 pt.
- AC23: La nota al pie de la página 2 (texto literal) se dibuja al final de la página solo si al menos una de las dos series tiene proyección.

### Página 3: Detalle

- AC24: Bajo el título `Detalle` van tres grupos de tarjetas con borde, tomados de `toKpiSections`:
  - `Eventos por estado`: 4 tarjetas en una fila;
  - `Usuarios por rol`: 4 tarjetas;
  - `Moderación`: 1 tarjeta con el valor de `Organizadores pendientes` y el texto literal `Solicitudes de organizador que esperan aprobación.`

  Cada valor sale de `formatMetricValue`. Las tarjetas se dibujan con el mismo helper de tarjeta que la página 1 (DRY).
- AC25: Bajo el título `Notas y metodología` van las 5 viñetas literales, en orden, ajustadas al ancho útil con `splitTextToSize`.

### Geometría pura (T2)

- AC26: Las funciones de `admin-pdf-chart.utils.ts`:
  - son puras, no importan `jspdf` y no conocen `PX` ni los mm;
  - reciben `PlotFrame` y trabajan con `y` creciente hacia abajo;
  - nunca devuelven `NaN`: un `max` ≤ 0 o no finito se trata como 1, igual que `[0, max || 1]` en el dashboard, y un `domainMax` ≤ 0 se trata como 1;
  - cumplen el algoritmo de "Tests requeridos".

### Verificación

- AC27: `npx vitest run` pasa, incluidos los 3 archivos de test nuevos. `npm run lint` y `npm run build` pasan.
- AC28 (manual): desde `/admin/dashboard`, "Exportar PDF" descarga `ticketera-dashboard-YYYY-MM-DD.pdf` con 3 páginas que coinciden con el mockup. En la vista previa de impresión en escala de grises, lo real y lo proyectado se distinguen y todo el texto se lee. Se repite con datos sin órdenes pagadas: la figura de ingresos muestra el mensaje vacío y el documento sigue teniendo 3 páginas.

## Tests requeridos

Vitest, con cada test junto a su archivo. Los montos esperados se construyen con `formatMetricValue` o con regex `\s`, nunca con un espacio ASCII fijo, porque ICU pone U+00A0 después de `S/`.

### `admin-executive-summary.test.ts` (T1)

- `formatPercentChange`:
  - `(1125, 1000)` → `"+12.5 %"`; `(97, 100)` → `"-3 %"`; `(100, 100)` → `"0 %"`; `(0, 500)` → `"-100 %"`; `(2, 3)` → `"-33.3 %"`;
  - `(10000, 10001)` → `"0 %"` (sin `-0`); `(5, 0)` → `null`.
- `buildExecutiveSummary`:
  - devuelve 5 hallazgos con los títulos en orden;
  - (1) cubre sus 4 ramas, con `{delta}` positivo (`+S/ …`), negativo (`-S/ …`) y que redondea a 0 (sin signo); con series vacías (6 ceros y `[]`) contiene `Aún no hay ventas registradas`;
  - (2) cubre con y sin puntos proyectados;
  - (3) cubre sus 4 ramas y los 2 sufijos; la rama vacía es igual a `EMPTY_SERIES_TEXT.newUsers`;
  - (4) devuelve el texto exacto;
  - (5) con 3 pendientes tiene `attention: true`; con 0 no tiene `attention` y usa la frase de 0;
  - ingresos vacía con usuarios proyectada (series independientes).
- `buildReportMeta`:
  - con `now = new Date("2026-10-12T19:05:00Z")` devuelve `Reporte de métricas · 2026-10-12` y `Generado el 2026-10-12, 14:05 (hora de Lima) · Tendencias de may 2026 a oct 2026`;
  - con `2026-11-01T03:00:00Z` usa `2026-10-31, 22:00`;
  - con `revenueByMonth: []`, `metaLine` termina en `(hora de Lima)`.
- `buildSummaryCards`: orden `Ingresos`, `Entradas vendidas`, `Comisión de la plataforma`; valores formateados y `detail` literales.
- `buildProjectionTotals`: suma de 3 proyectados y `detail` `Suma de nov 2026 a ene 2027`; sin proyección da `Sin proyección` con su `detail`; cada serie es independiente.
- Latin-1: para todos los fixtures anteriores, todo `title`, `text`, `label`, `value`, `detail` y `metaLine` cumple `/^[ -ÿ]*$/`.

### `admin-pdf-chart.utils.test.ts` (T2)

Usan frames arbitrarios, en unidades abstractas.

- `niceTicks`, con este algoritmo:
  - `m = max > 0 && isFinite(max) ? max : 1`;
  - `raw = m / count`; `mag = 10 ** Math.floor(Math.log10(raw))`;
  - `step = max(minStep, mag × primer multiplicador de {1, 2, 5, 10} con mag × mult ≥ raw)`;
  - `top = Math.ceil(m / step) × step`; `ticks = 0, step, …, top`.

  Casos:
  - `(980, { minStep: 1 })` → `[0, 200, 400, 600, 800, 1000]`; `(1000, { minStep: 1 })` → `[0, 200, 400, 600, 800, 1000]`;
  - `(7, { minStep: 1 })` → `[0, 2, 4, 6, 8]`; `(3, { minStep: 1 })` → `[0, 1, 2, 3]`;
  - `(0, { minStep: 1 })` → `[0, 1]`; `(-Infinity, { minStep: 1 })` → `[0, 1]`; `(NaN, { minStep: 1 })` → `[0, 1]`;
  - `(1_234_567, { minStep: 100 })` → `[0, 500000, 1000000, 1500000]`; `(45_000, { minStep: 100 })` → `[0, 10000, 20000, 30000, 40000, 50000]`.
- `scaleY` con frame `{ left: 0, top: 10, width: 100, height: 50 }`:
  - `(0, 1000)` → 60; `(1000, 1000)` → 10; `(500, 1000)` → 35;
  - `(0, 0)` → 60, sin `NaN`.
- `columnCenterX` con frame `{ left: 20, width: 144 }`: 9 columnas de 16, así que `(0, 9)` → 28 y `(8, 9)` → 156; 6 columnas de 24, así que `(0, 6)` → 32.
- `barRect`:
  - ancho = 60 % de la columna, centrado en `columnCenterX`;
  - `y = scaleY(value)`; `height = frame.top + frame.height - y`;
  - con valor 0, `height` es 0 e `y` es la base; nunca da alto negativo.
- `projectionBandRect`: con 6 reales + 3 proyectados y frame `{ left: 20, top: 10, width: 144, height: 50 }` → `{ x: 116, y: 10, width: 48, height: 50 }`; sin proyectados → `null`.

### `admin-pdf-draw.test.ts` (T3, smoke)

- La primera línea es `// @vitest-environment node`, porque `buildDashboardPdf` no toca el DOM y así no se depende de jsdom.
- Sin mocks ni spies sobre jsPDF: solo comprueba lo observable del documento devuelto.
  - Con métricas completas (proyección en las dos series y 3 pendientes): `doc.getNumberOfPages() === 3`, y `doc.output()` contiene `Resumen ejecutivo`, `Tendencias`, `Notas y metodología`, `Página 3 de 3` y `Requiere atención`.
  - Con las dos series vacías (6 ceros, sin proyección) y 0 pendientes: no lanza, `getNumberOfPages() === 3`, `doc.output()` contiene `EMPTY_SERIES_TEXT.newUsers` y el fragmento `primeros pagos`, y **no** contiene `Requiere atención`.
  - Con datos en las dos series y sin proyección: no lanza y da 3 páginas.
- Esto funciona porque `compress` no está activado (AC2): `output()` contiene el texto en claro. Lo verifiqué con jsPDF 4.2.1 en Node, tanto con `require` como con `import()` ESM. Solo es fiable para cadenas dibujadas en **una** llamada a `doc.text`; por eso los textos que se buscan son títulos cortos o mensajes de una línea.

## Tareas

### T1 — Textos puros de la página 1

- Archivos: `src/modules/admin/admin-executive-summary.ts`, `src/modules/admin/admin-executive-summary.test.ts`
- Depende de: —
- Paralelizable: sí (con T2)
- Cubre: AC11, AC12, AC13, AC14, AC15, AC16

### T2 — Geometría pura de los gráficos

- Archivos: `src/modules/admin/admin-pdf-chart.utils.ts`, `src/modules/admin/admin-pdf-chart.utils.test.ts`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC26

### T3 — Dibujo del PDF de 3 páginas

- Archivos: `src/modules/admin/admin-pdf-draw.ts`, `src/modules/admin/admin-pdf-draw.test.ts`, `src/modules/admin/admin-export.ts`. En este último solo cambia la parte PDF: `downloadDashboardXlsx` y su código de apoyo quedan intactos. Se quitan los imports que queden sin uso: tras el cambio, `formatMetricValue` y `toLimaDate` ya no se usan ahí, y `npm run lint` debe pasar.
- Depende de: T1, T2
- Paralelizable: no
- Cubre: AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC17, AC18, AC19, AC20, AC21, AC22, AC23, AC24, AC25, AC27, AC28

## Preguntas abiertas

1. **Poppins**: ¿se quiere incrustar la fuente de marca en el PDF? Son unos 150 KB por peso (regular + bold ≈ 300 KB) y se cargaría bajo demanda. También resolvería el límite Latin-1. Default: Helvetica.
2. **Mes parcial**: los hallazgos (1) y (3) comparan el mes en curso de Lima, que está incompleto, con el anterior completo, así que casi siempre van a leerse como caída. Default: se compara igual y se rotula "(mes en curso, parcial)". Alternativa: comparar los dos últimos meses completos (penúltimo frente a antepenúltimo). ¿Cuál prefiere?
3. **Formato de fecha**: el encabezado y los metadatos usan ISO (`2026-10-12`), igual que el nombre del archivo. ¿El mockup pide `12 oct 2026`?
4. **Eje X**: se decidió que la cabecera de la tabla haga de eje X, sin etiquetas propias bajo el gráfico (Decisión 11). Si el mockup muestra etiquetas bajo el área de trazado además de la tabla, hay que indicarlo.
5. **Etiqueta "Comisión"**: el mockup dice "Comisión", pero la spec reutiliza `Comisión de la plataforma` de `toKpiSections` para no duplicar etiquetas. ¿Es aceptable?
6. **Montos grandes en la tabla**: con columnas de 16 mm, desde unos S/ 1,000,000 el valor pasa a formato compacto (`S/ 1 M`) y pierde precisión. El Excel conserva el valor exacto. ¿Es aceptable?

## Próximas fases

- Mover los `emptyMessage` de `AdminDashboard.tsx` a una constante compartida con `EMPTY_SERIES_TEXT`; esto requiere tocar la UI del dashboard.
- Unificar `pdfText` de `admin-pdf-draw.ts` y `ticket-export.ts` en `src/lib`, si se decide tocar `booking`.
- Incrustar Poppins si se aprueba la Pregunta abierta 1.
