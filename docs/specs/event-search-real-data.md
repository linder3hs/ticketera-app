# Búsqueda y listado `/events` con datos reales

Estado: aprobada

## Objetivo

Hoy la búsqueda pública `/events` lee del mock `src/modules/event/services/event-service.ts`. Desde allí obtiene `searchEvents`, `getUpcomingEvents` (el catálogo que alimenta facetas y meses), `getCategories` y `getCities`. Esta spec la pasa a Postgres/Drizzle (driver `neon-http`). Resultados, categorías, ciudades, conteos por faceta y meses disponibles salen de la DB.

Se mantienen los filtros que ya existen (texto, categoría, ciudad, mes, rango de precio y "desde" fecha), los dos órdenes (fecha y precio) y la URL como fuente del estado. Es una tarea **de solo lectura**: no hay escrituras en la DB.

Listo cuando un evento publicado desde el panel aparece en `/events` y responde a los filtros.

Referencias (consultar solo estas secciones):

- `system-design.md §3`, "Reglas de límite": los services no importan `next/*` y `src/app` no contiene lógica de dominio. Por eso la composición filtro + orden es una función pura en `event-search.ts` y no vive en la página.
- `erd.md §5`, "Índices recomendados": `event(status, starts_at)`, `event(category_id)` y `venue(city)` "para la búsqueda por ciudad y categoría".
  - Los tres ya existen en el schema: `event_status_starts_at_idx` y `event_category_id_idx` en `src/db/schema/event.ts:53-54`, y `venue_city_idx` en `src/db/schema/venue.ts:26`.
  - El enfoque de esta spec (catálogo en memoria) solo usa el primero, a través de `isPublic`. Los otros dos quedan listos para el camino de mejora (ver "Techo y camino de mejora").
- Spec aprobada `event-detail-real-data.md` (tarea 03): sus "Decisiones", "Definiciones" y "Preguntas abiertas". Esta spec **reutiliza** sus definiciones y no las redefine:
  - visible en público = `status = 'published'` y `starts_at > now` (`isPublic(now)`, D3);
  - `Event.slug` es la clave de la URL del detalle y `Event.id` la identidad interna (D2);
  - disponibilidad por suma de zonas (`toPublicEvents`).
- Next 16 (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`, versión 16.3.6):
  - `searchParams` es una `Promise` (líneas 67-117);
  - es una "Request-time API" que pasa la página a renderizado dinámico (línea 119).

  La página ya hace `await searchParams` y `next.config.ts` no activa `cacheComponents`. Por eso no hace falta ninguna directiva de caché, y `npm run build` no consulta la DB.

**Precondición:** la tarea 03 tiene que estar integrada. Al escribir esta spec está en el working tree sin commit (`events/[slug]/` sin seguimiento y `events/[id]/` eliminado). T1 parte de `event-public-service.ts` tal como lo deja la tarea 03.

### Definiciones

- **Catálogo público**: todos los eventos visibles en público en `now` (`isPublic(now)`), con la forma `Event` que produce `toPublicEvents`.
  - Viene **sin límite** y ordenado por `starts_at, id`, igual que `selectPublicEvents`.
  - `category` es el label de la categoría y `city` sale de `venue.city`, así que `filterEvents` y `getFacetCounts` funcionan sin cambios sobre esa salida.
- **Una sola lectura por request.** Se lee el catálogo una vez y de esa lectura salen:
  - los resultados (`searchCatalog` = `filterEvents` + `sortEvents`);
  - los conteos por faceta (`getFacetCounts`);
  - los meses (`getMonthOptions`);
  - las ciudades (`getCityOptions`).

  Las categorías salen de `listPublicCategories()` (`id` = slug, ordenadas por label). Son todas las categorías, también las que tienen 0 eventos, igual que el mock.

- **Conteos y meses sobre todo el catálogo**, no sobre los resultados filtrados. Es el comportamiento actual. El número "N eventos" sí cuenta los resultados filtrados.
- **Ciudades** = las ciudades distintas del catálogo, en orden alfabético con `localeCompare(…, "es")`, como el mock `getCities` (`event-service.ts:331`).
  - La página las obtiene llamando directamente a `getCityOptions(catalog)`, no con `Object.keys(counts.cities)`. Así el orden queda explícito y no depende del orden de inserción de las claves de un objeto.
  - No se hace `SELECT DISTINCT venue.city`: sería una consulta extra para un dato que ya está en memoria.
  - Una ciudad solo aparece si tiene al menos un evento visible.
- **Orden por fecha**: `sortEvents` compara `date`, que es el día de Lima. Dentro de un mismo día queda el orden del catálogo (`starts_at`, `id`), porque `Array.prototype.sort` es estable.
  - **Orden por precio**: `priceFrom` ascendente, luego día y luego el orden del catálogo.
  - Para que esto se cumpla, el catálogo tiene que llegar en el orden de la consulta.
- **`mes` y `desde` comparan el día de Lima** (`toLimaDate`), mientras que `isPublic` compara el instante (`starts_at > now`). Un evento de hoy más tarde es visible y cumple `desde=<hoy>`.
- **Precio**: `priceFrom = minPriceCents / 100` (`toPublicEvents`). Se compara como número contra `PRICE_RANGES`, sea cual sea `currency`.
  - Un evento sin zonas sale con `priceFrom: 0` y cae en "Hasta S/ 50".
  - Los eventos creados desde el panel siempre son `PEN` (default de `event.currency`; `event-write.schema.ts` no lo fija). El seed sí inserta eventos en `EUR` y `USD` (`event-service.ts:114` y `:130`), así que esto ya pasa con datos reales.
- **Enlaces**: `EventCard` ya enlaza a `/events/${event.slug}`. Con el catálogo real, cada tarjeta abre el detalle real, que usa la misma `isPublic`, así que no hay 404.
  - Esto cierra la nota de la Pregunta 8 de la tarea 03: el precio y el estado de la tarjeta de `/events` ya coinciden con los del detalle y la landing.

### Techo y camino de mejora

- **Techo**: cientos o pocos miles de eventos visibles. Cada request lee el catálogo completo y sus zonas: `selectPublicZones` usa `inArray(event_zone.event_id, ids)` con todos los ids, es decir, un parámetro por evento. Luego filtra y ordena en memoria.
- **Camino de mejora**, cuando el catálogo crezca o aparezca la paginación:
  - mover los filtros a SQL con los índices de `erd.md §5`, que ya existen (`event_status_starts_at_idx`, `event_category_id_idx`, `venue_city_idx`): no hace falta migración;
  - paginar con `limit`/`offset` o con cursor;
  - calcular los conteos por faceta con `GROUP BY`;
  - leer los meses con `DISTINCT` sobre el día de Lima.

  Hoy no se propone SQL ni migración: la UI no pagina y el volumen no lo exige (YAGNI).

## Alcance

- Incluye:
  - **Lectura del catálogo** en `event-public-service.ts`. Se extiende el archivo; no se crea otro service.
    - `selectPublicEvents(where, limit?)`: `limit` pasa a ser opcional. Sin `limit` **no hay cláusula `LIMIT`**: no se pasa un número grande ni `Infinity`.
      - Drizzle tipa `limit()` como `number | Placeholder`, así que `undefined` no compila. P. ej., `$dynamic()` (`drizzle-orm/pg-core/query-builders/select.d.ts:589`) con `.limit(limit)` condicional.
      - Se actualiza el JSDoc: "Up to `limit` events…" deja de ser siempre cierto.
      - `listFeaturedEvents`, `listUpcomingEvents` y `listRelatedEvents` siguen pasando su límite y no cambian.
    - `listPublicCatalog(now = new Date()): Promise<Event[]>` = `selectPublicEvents(isPublic(now))`. Lleva un JSDoc que explica que es para la búsqueda y no tiene límite (ver "Techo y camino de mejora").
    - **Sin `cache` de `react`**: la página la llama una sola vez y su `metadata` es estática. `getPublicEventDetail` usa `cache` en el mismo archivo, pero ese patrón no aplica aquí.
    - **Es el único archivo de la tarea 03 que se toca.** Motivos:
      - `isPublic` y `selectPublicEvents` son internos de ese archivo y la visibilidad pública tiene que vivir en un solo lugar;
      - exportar `isPublic` o duplicar la consulta en otro service rompería DRY.

      `event-public.utils.ts` y `event-public.utils.test.ts` no cambian, y tampoco las firmas de `toPublicEvents`, `summarizeZones` y `availabilityStatus`. La tarea 03 también editó `event-search.test.ts` y `event-service.ts`, pero solo para agregar el `slug` literal. Esos archivos son de la búsqueda y del mock, que es justo lo que esta tarea pasa a la DB y retira.
  - **Funciones puras** en `event-search.ts`:
    - `getCityOptions(events: Event[]): string[]`: ciudades distintas, en orden alfabético con `localeCompare(b, "es")`.
    - `searchCatalog(events: Event[], filters: EventSearchFilters, categories: EventCategory[]): Event[]` = `sortEvents(filterEvents(events, filters, categories), filters.sort)`.
      - Es la composición que hacía el mock `searchEvents` (`event-service.ts:326`).
      - Se mueve aquí, y no a la página, porque:
        - es lógica de dominio y `src/app` no la admite;
        - su test ("applies filters and the price sort") se borra del mock en T3 y tiene que conservar la cobertura aquí.
    - `getFacetCounts` reutiliza `getCityOptions(events)` para enumerar las ciudades, en vez de su `new Set(...)` propio (DRY).
      - El resultado es el mismo salvo el orden de las claves de `counts.cities`, que nadie recorre: `EventFilters` indexa con `counts.cities[city]`.
      - Su firma no cambia.
    - Se actualiza el comentario de `PRICE_RANGES`: se quita "Mock:" y se describe el comportamiento real (ver "Definiciones → Precio").
    - Las demás funciones y constantes (`parseSearchParams`, `toSearchParams`, `toSearchHref`, `filterEvents`, `sortEvents`, `getMonthOptions`, `getActiveFilterChips`, `EMPTY_FILTERS`, `SORT_OPTIONS`) no cambian.
  - **Página** `src/app/(platform)/events/page.tsx`: solo compone y ya no importa `event-service.ts`.
    - `filters = parseSearchParams(await searchParams)`.
    - `const [catalog, categories] = await Promise.all([listPublicCatalog(), listPublicCategories()])`.
    - `results = searchCatalog(catalog, filters, categories)`, `months = getMonthOptions(catalog)`, `cities = getCityOptions(catalog)` y `counts = getFacetCounts(catalog, categories)`.
    - Los componentes reciben las mismas props que hoy.
    - `metadata` no cambia y la página sigue sin exportar `dynamic`, `revalidate` ni `generateStaticParams`.
  - **Limpieza del mock**: se retiran `searchEvents`, `getCities` y `getRelatedEvents`, que quedan sin uso.
    - Se verificó con `grep -rnE "searchEvents|getCities|getRelatedEvents" src`: sus únicos usuarios son `events/page.tsx` (que T2 cambia), sus definiciones y `event-service.test.ts`.
    - En `event-service.ts`:
      - se borran las tres funciones;
      - se borra el import de `filterEvents`/`sortEvents` (línea 1), que solo usaba `searchEvents`;
      - del import de tipos se quita `EventSearchFilters`, que queda sin uso (lint);
      - el comentario de cabecera pasa a decir que el mock solo alimenta "Mis entradas" (`/my-tickets`), `booking/services/venue-service.ts` y el seed, y que la landing, la búsqueda y el detalle leen la DB.
    - En `event-service.test.ts`:
      - se borran los `describe` de `getRelatedEvents`, `searchEvents` y `getCities`;
      - se quitan esos nombres del import;
      - se borra el import de `EMPTY_FILTERS`, que solo usaba `searchEvents`.
    - Se mantienen `getUpcomingEvents`, `getEventById` y `getCategories` con sus tests, porque los usan `my-tickets/page.tsx` (tarea 09), `src/db/seed-data.ts`, `booking/services/venue-service.ts` y `order-service.test.ts`.
- No incluye:
  - Cambios de UI: `EventSearchForm`, `EventFilters`, `ActiveFilterChips`, `SortToggle`, `EventGrid`, `EventCard` y `use-event-search-params.ts` no cambian, y las claves de la URL (`q`, `categoria`, `ciudad`, `mes`, `precio`, `desde`, `orden`) tampoco.
  - Paginación, filtrado en SQL, migraciones o índices nuevos.
  - Cambios en `src/db/schema/*`, `next.config.ts` o `docs/architecture/*`.
  - Convertir monedas o cambiar `PRICE_RANGES`: se cambia solo su comentario.
  - Buscar por descripción o por categoría en el texto libre: `filterEvents` sigue buscando en título, recinto y ciudad.
  - `/my-tickets` (tarea 09), y retirar `getUpcomingEvents`, `getEventById` y `getCategories` del mock.
  - `event-public.utils.ts`, su test y cualquier otro archivo de la tarea 03 distinto de `event-public-service.ts`.

## Reutilizar

- `src/modules/event/services/event-public-service.ts`: `isPublic(now)`, `selectPublicEvents`, `selectPublicZones` y `publicEventColumns` (internos), y `listPublicCategories()` (exportada).
- `src/modules/event/event-public.utils.ts`: `toPublicEvents` (día de Lima, `priceFrom`, `status`, `slug`), sin cambios.
- `src/modules/event/event-search.ts`: `parseSearchParams`, `filterEvents`, `sortEvents`, `getFacetCounts`, `getMonthOptions`, `getActiveFilterChips` y `PRICE_RANGES`.
- Componentes y hook de la búsqueda tal cual: `EventSearchForm`, `EventFilters` (`cities: string[]` y `counts`), `ActiveFilterChips`, `SortToggle`, `EventGrid` y `use-event-search-params.ts`.
- Índice `event_status_starts_at_idx`, que cubre `isPublic`.
- UI: no hace falta `npx shadcn add`, así que no hay T0.

## Archivos

| Archivo                                              | Cambio                                                                                                         | Tarea |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----- |
| `src/modules/event/services/event-public-service.ts` | `selectPublicEvents` con `limit` opcional (sin `LIMIT`) y JSDoc; + `listPublicCatalog(now)`                    | T1    |
| `src/modules/event/event-search.ts`                  | + `getCityOptions`, `searchCatalog`; `getFacetCounts` reutiliza `getCityOptions`; comentario de `PRICE_RANGES` | T1    |
| `src/modules/event/event-search.test.ts`             | + casos de `getCityOptions` y `searchCatalog`                                                                  | T1    |
| `src/app/(platform)/events/page.tsx`                 | lee el catálogo y las categorías de la DB; compone con las funciones puras; sin imports del mock               | T2    |
| `src/modules/event/services/event-service.ts`        | − `searchEvents`, `getCities`, `getRelatedEvents` y sus imports muertos; comentario de cabecera                | T3    |
| `src/modules/event/services/event-service.test.ts`   | − `describe` de esas tres funciones, sus imports y `EMPTY_FILTERS`                                             | T3    |

## Criterios de aceptación

- AC1 (manual, de la tarjeta):
  - Un evento publicado desde el panel, con fecha futura, aparece en `/events` sin filtros.
  - Ese evento responde a cada filtro por separado: texto (título, recinto o ciudad, sin importar mayúsculas ni tildes), categoría, ciudad, mes, rango de precio y "desde". Aparece cuando el filtro lo incluye y desaparece cuando lo excluye.
  - Responde a los dos órdenes: "Fecha" y "Precio más bajo".
  - Un evento en `draft`, `cancelled` o `finished`, o `published` con `starts_at <= now`, no aparece en los resultados ni suma en conteos, ciudades o meses.
- AC2: La visibilidad pública es la de la tarea 03: `listPublicCatalog` filtra con `isPublic(now)` a través de `selectPublicEvents`. No hay otra definición de visibilidad ni otra consulta de eventos fuera de `event-public-service.ts`.
- AC3: Los conteos por categoría y por ciudad, y la lista de meses, se calculan sobre todo el catálogo público, no sobre los resultados filtrados. Al aplicar un filtro, los conteos no cambian. "N eventos" muestra la cantidad de resultados filtrados.
- AC4: Las ciudades del filtro son las distintas del catálogo, en orden alfabético `es`. Las categorías son todas las de `listPublicCategories()` (ordenadas por label, `id` = slug), con su conteo (0 si no tienen eventos).
- AC5: La URL sigue siendo la fuente del estado:
  - las claves (`q`, `categoria`, `ciudad`, `mes`, `precio`, `desde`, `orden`) y los componentes no cambian;
  - una URL como `/events?categoria=<slug>&ciudad=Lima&orden=price` da los mismos resultados al recargar o al compartirla;
  - los chips y "Limpiar filtros" funcionan igual que hoy.
- AC6: Orden:
  - "Fecha" ordena por día de Lima ascendente y, dentro del mismo día, por `starts_at`;
  - "Precio más bajo" ordena por `priceFrom` ascendente y luego por fecha.
- AC7: Cada tarjeta de `/events` enlaza a `/events/<slug>` y abre el detalle real (200, no 404). Su precio "desde" y su estado coinciden con los del detalle y con los de la tarjeta del mismo evento en la landing.
- AC8: Con el catálogo vacío (DB sin eventos visibles), `/events` muestra el estado vacío actual ("No encontramos eventos con esos filtros"), con conteos en 0, sin ciudades ni meses y sin errores.
- AC9: `listPublicCatalog` hace una sola consulta de eventos, sin cláusula `LIMIT`, más una de zonas (`selectPublicZones`). `listFeaturedEvents`, `listUpcomingEvents` y `listRelatedEvents` siguen aplicando su límite (5, 8 y 4).
- AC10: La página solo compone:
  - no importa `event-service.ts`;
  - no contiene filtrado, orden, conteo ni derivación de ciudades o meses: todo eso vive en `event-search.ts`;
  - no exporta `dynamic`, `revalidate` ni `generateStaticParams`;
  - `npm run build` no consulta la DB.
- AC11: Mock:
  - `searchEvents`, `getCities` y `getRelatedEvents` ya no existen, y `grep -rnE "searchEvents|getCities|getRelatedEvents" src` no devuelve resultados;
  - `getUpcomingEvents`, `getEventById` y `getCategories` siguen exportadas y con tests;
  - `/my-tickets`, `venue-service.ts` y `buildSeedData` siguen funcionando.
- AC12: Calidad:
  - `event-public-service.ts` no importa `next/*` y `listPublicCatalog` no usa `cache`;
  - `toPublicEvents`, `summarizeZones` y `availabilityStatus` mantienen su firma, y `event-public.utils.ts` no cambia;
  - `npx vitest run`, `npm run lint` y `npm run build` pasan en verde.

## Tests requeridos

(Vitest, junto al archivo)

- `src/modules/event/event-search.test.ts` (se extiende; los casos que ya existen siguen en verde sin cambios):
  - `getCityOptions`:
    - devuelve cada ciudad una sola vez;
    - con `["Lima", "Ática", "Arequipa", "Lima"]` devuelve `["Arequipa", "Ática", "Lima"]`. Este caso distingue el orden `es` del orden por code unit: con un `.sort()` simple, `"Ática"` quedaría al final;
    - con un catálogo vacío devuelve `[]`.
  - `searchCatalog`:
    - sin filtros devuelve todo el catálogo ordenado por fecha;
    - con filtros y `sort: "price"` devuelve solo los que cumplen, por `priceFrom` ascendente (el caso que se retira del mock);
    - con dos eventos del mismo día, el orden por fecha conserva el orden de entrada (estabilidad que depende del orden de la consulta);
    - no muta el arreglo de entrada.
  - `getFacetCounts`: el caso que ya existe ("counts events per category and city") sigue en verde tras reutilizar `getCityOptions`.
- `event-service.test.ts`: solo se borran los `describe` retirados. Los de `getUpcomingEvents`, `getEventById` y `getCategories` siguen en verde.
- `event-public-service.ts` no lleva tests unitarios, igual que en la tarea 03: las consultas son finas y la lógica vive en funciones puras con test. La página tampoco requiere test.

## Tareas

### T1 — Catálogo público y funciones puras de la búsqueda

- Archivos: `src/modules/event/services/event-public-service.ts`, `src/modules/event/event-search.ts`, `src/modules/event/event-search.test.ts`
- Depende de: — (requiere la tarea 03 integrada; ver "Precondición")
- Paralelizable: no. Es la única tarea de la ola 1: T2 la importa y T3 depende de T2.
- Cubre: AC2, AC3 (funciones), AC4 (ciudades), AC6, AC9, AC12

### T2 — `/events` lee de la DB

- Archivos: `src/app/(platform)/events/page.tsx`
- Depende de: T1
- Paralelizable: no (ola 2, sola)
- Cubre: AC1, AC3, AC4, AC5, AC7, AC8, AC10

### T3 — Retirar del mock lo que queda sin uso

- Archivos: `src/modules/event/services/event-service.ts`, `src/modules/event/services/event-service.test.ts`
- Depende de: T2. No va en paralelo con T1 ni con T2: si las exportaciones desaparecen mientras la página todavía las importa, el typecheck se rompe entre olas.
- Paralelizable: no (ola 3, sola)
- Cubre: AC11, AC12 (lint sin imports muertos)

Olas: T1 → T2 → T3, en secuencia. **Paralelizables: ninguna.**

## Preguntas abiertas

Cada pregunta trae un valor por defecto. Si no hay respuesta, se aplica ese valor.

1. **Filtrado en memoria o en SQL.** Por defecto: **en memoria**, con una sola lectura del catálogo público por request. El techo y el camino de mejora están en "Techo y camino de mejora".
2. **Paginación.** Por defecto: **sin paginación**, porque la UI no la tiene.
3. **Índices de `erd.md §5`.** Por defecto: **sin migración**. Los índices de la búsqueda (`event(status, starts_at)`, `event(category_id)` y `venue(city)`) ya existen en el schema. El enfoque en memoria solo usa el primero, y el camino de mejora puede usar los otros dos sin migrar.
4. **Limpieza del mock.** Por defecto: **retirar** `searchEvents`, `getCities` y `getRelatedEvents` con sus tests, y **mantener** `getUpcomingEvents`, `getEventById` y `getCategories` (los usan `/my-tickets` de la tarea 09, el seed, `venue-service.ts` y `order-service.test.ts`).
5. **Orden de las ciudades.** Por defecto: **alfabético con `localeCompare(…, "es")`**, igual que el mock. No se usa el orden del catálogo.
6. **Eventos sin zonas.** Por defecto: se mantiene `priceFrom: 0`, así que caen en "Hasta S/ 50". Refleja `toPublicEvents`, que no cambia. Su estado es `sold-out`.
7. **Moneda en el filtro de precio.** Por defecto: **se compara el número tal cual**, sea cual sea la moneda, y solo se actualiza el comentario de `PRICE_RANGES`.
   - Los eventos del panel siempre son `PEN`.
   - Los únicos `EUR`/`USD` son eventos del seed: una entrada de 120 USD cae en "S/ 50 – 150".
   - Convertir monedas o filtrar por moneda queda para "Próximas fases".
8. **Discrepancias con `docs/architecture/*`.** Por defecto: **ninguna encontrada**. `system-design.md §3` se cumple: el service no importa `next/*` y la página solo compone. Los índices de `erd.md §5` ya están en el schema.

## Próximas fases

- Filtrado, paginación y conteos por faceta en SQL (`GROUP BY`) sobre los índices que ya existen, cuando el catálogo pase de unos pocos miles de eventos o la UI pagine.
- Filtro de precio con conciencia de moneda (conversión, o filtrar y etiquetar por `currency`).
- Tarea 09: "Mis entradas" con la DB. Después, retirar `getUpcomingEvents`, `getEventById` y `getCategories` del mock cuando `seed-data.ts` y `venue-service.ts` dejen de depender de ellos.
