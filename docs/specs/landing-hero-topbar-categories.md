# Iteración UI: Hero carousel, Topbar sticky y categorías en card

Estado: aprobada

## Objetivo

Iterar sobre la landing ya construida (`docs/specs/event-landing-page.md`, `PASS`) con 4 cambios de UI pedidos por el usuario: (1) el Hero pasa a mostrar un carrusel de eventos principales en vez del buscador plano; (2) se separa la búsqueda en un `Topbar` propio (texto, fecha, precio) debajo del `Navbar`; (3) `Navbar` + `Topbar` quedan sticky juntos al hacer scroll; (4) la sección de categorías crece y pasa de chips sueltos a tarjetas (`Card`) con íconos más llamativos.

## Alcance

- Incluye:
  - `HeroCarousel`: carrusel banner (imagen de fondo + overlay + título/fecha/precio/CTA) con los eventos `featured`, usando el mismo primitivo shadcn `Carousel` ya instalado (sin agregar la librería Swiper — YAGNI, ya se decidió esto en la spec anterior y sigue aplicando).
  - `Hero.tsx` rediseñado: mantiene el H1/subheadline de marca, quita el formulario de búsqueda (se muda al `Topbar`) y agrega `HeroCarousel`.
  - `Topbar`: buscador por texto, fecha (`Input type="date"`) y precio (`Select` con rangos predefinidos), mock/no funcional — mismo criterio que el resto de la landing (sin lógica real de filtrado, fuera de alcance).
  - `SiteHeader`: contenedor `sticky top-0` único que agrupa `Navbar` + `Topbar`, para que ambos permanezcan visibles al hacer scroll sin duplicar la lógica sticky.
  - Categorías: de 5 a 8, en `CategoryCard` (shadcn `Card`) con ícono dentro de un círculo de color, grid responsivo (reemplaza a `CategoryChip`).
  - Extracción a `event.utils.ts` (`formatEventDate`, `formatEventPrice`) y `EventStatusBadge` compartido, para que `EventCard` y `HeroCarousel` no dupliquen el formateo/badge de estado.
  - Se elimina la sección "Eventos destacados" (con `FeaturedCarousel`) de más abajo en la página — sus eventos ahora se muestran en el Hero; mantenerla duplicaría el mismo contenido dos veces en la misma landing.
- No incluye:
  - Lógica real de búsqueda/filtrado por texto, fecha o precio (sigue siendo mock, como en toda la landing hasta ahora).
  - Autoplay o paginación por puntos en los carruseles (no lo pidió el usuario; flechas + swipe nativo de embla ya cumplen "swiper").
  - Cambiar los 2 acentos de color del design system (`primary` indigo + `cta` naranja) — los íconos "llamativos" de categoría se logran con círculos de color alternando esos dos tonos en `/10`, más tamaño e interacción hover, no con una paleta nueva (mantiene el principio "dos acentos, no más" de `docs/design/design-system.md`).
  - Nuevos eventos mock para las 3 categorías nuevas (Cine, Comedia, Arte) — las categorías son navegación visual, no filtran `EventGrid` todavía (ya era así antes de esta iteración).

## Reutilizar

- Primitivos shadcn ya instalados: `Card`, `Badge`, `Button`, `Input`, `Carousel`/`CarouselContent`/`CarouselItem`/`CarouselPrevious`/`CarouselNext`, `Sheet`. Falta `Select` → instalar con `npx shadcn@latest add select`.
- `cn()` de `src/lib/utils.ts`, `lucide-react`, `class-variance-authority` — ya instalados, no agregar nada nuevo.
- Patrón de formulario mock (`onSubmit` + `preventDefault`, sin acción real) ya usado en `Hero.tsx`/`Newsletter.tsx` — reutilizar el mismo criterio en `Topbar`.

## Archivos

**T1 (datos y compartidos de evento):**
- `src/modules/event/event.utils.ts` (nuevo)
- `src/modules/event/event.utils.test.ts` (nuevo)
- `src/modules/event/components/EventStatusBadge.tsx` (nuevo — extraído de `EventCard.tsx`)
- `src/modules/event/services/event-service.ts` (modificado — `getCategories()` de 5 a 8)
- `src/modules/event/services/event-service.test.ts` (modificado solo si alguna aserción queda invalidada por el cambio de categorías)

**T2 (layout sticky: Navbar/Topbar/SiteHeader):**
- `src/components/ui/select.tsx` (nuevo, `npx shadcn@latest add select`)
- `src/components/Navbar.tsx` (modificado — deja de ser sticky/`<header>` propio)
- `src/components/Topbar.tsx` (nuevo)
- `src/components/SiteHeader.tsx` (nuevo)

**T3 (Hero + HeroCarousel):**
- `src/components/Hero.tsx` (modificado)
- `src/modules/event/components/HeroCarousel.tsx` (nuevo)
- `src/modules/event/components/FeaturedCarousel.tsx` (eliminado — reemplazado por `HeroCarousel`, ya no se usa en la página)

**T4 (categorías en card + EventCard usando utils compartidos):**
- `src/modules/event/components/CategoryCard.tsx` (nuevo)
- `src/modules/event/components/CategoryChip.tsx` (eliminado — reemplazado por `CategoryCard`)
- `src/modules/event/components/EventCard.tsx` (modificado — usa `event.utils.ts` y `EventStatusBadge` de T1 en vez de sus funciones/JSX inline)

**T5 (composición):**
- `src/app/page.tsx` (modificado)

## Criterios de aceptación

- AC1: El Hero ya no tiene formulario de búsqueda; en su lugar renderiza `HeroCarousel` con los eventos `featured` — banner full-width con imagen de fondo, overlay oscuro para legibilidad, título/fecha/precio/CTA superpuestos, navegable con flechas (`CarouselPrevious`/`CarouselNext`) y swipe/drag nativo de embla.
- AC2: Existe `Topbar` con 3 controles (texto, fecha, precio) + botón "Buscar", todos mock (sin acción real), ubicado entre `Navbar` y el resto del contenido.
- AC3: `Navbar` y `Topbar` están dentro de un único wrapper `SiteHeader` con `sticky top-0 z-40`; al hacer scroll ambos permanecen visibles pegados arriba, sin huecos ni doble sticky (verificar que ni `Navbar` ni `Topbar` definan su propio `position: sticky` por separado).
- AC4: La sección de categorías muestra 8 categorías en `CategoryCard` (shadcn `Card`), cada una con su ícono lucide dentro de un círculo de color (alternando tono `primary`/`cta` en `/10`), en un grid responsivo (`grid-cols-2` mobile → `grid-cols-4` desktop), con hover (`shadow`/`translate-y`, sin `scale` que desplace layout) y `cursor-pointer`.
- AC5: `formatEventDate`/`formatEventPrice` viven una sola vez en `event.utils.ts` y los usan tanto `EventCard` como `HeroCarousel` (sin duplicar la función); `EventStatusBadge` vive una sola vez y la usan ambos componentes.
- AC6: La sección "Eventos destacados" (carrusel de cards duplicando el Hero) ya no existe en `page.tsx`; `FeaturedCarousel.tsx` fue eliminado (no queda código muerto sin importar).
- AC7: `npm run build`, `npm run lint` y `npx vitest run` pasan sin errores.
- AC8: Responsive 375px–1440px sin scroll horizontal; en mobile el `Topbar` stackea sus 3 controles + botón en columna; contraste del texto sobre las imágenes del `HeroCarousel` ≥ 4.5:1 gracias al overlay.

## Tests requeridos

- `src/modules/event/event.utils.test.ts` (Vitest) — cubre AC5: `formatEventDate` (formato esperado y corrección de zona horaria UTC) y `formatEventPrice` (formato de moneda) con casos concretos.
- `src/modules/event/services/event-service.test.ts` — si `getCategories()` cambia de forma (más de 5 elementos), confirmar que el test siga pasando; ajustar solo si alguna aserción hardcodeaba el conteo anterior.
- No se requieren tests nuevos para `HeroCarousel`, `Topbar`, `SiteHeader`, `CategoryCard`, `Navbar`, `Hero` (componentes visuales, sin lógica de negocio — SETUP.md los exime).

## Tareas

### T1 — Utilidades y componentes compartidos de evento
- Archivos: `src/modules/event/event.utils.ts`, `src/modules/event/event.utils.test.ts`, `src/modules/event/components/EventStatusBadge.tsx`, `src/modules/event/services/event-service.ts`, `src/modules/event/services/event-service.test.ts`
- Depende de: —
- Paralelizable: sí (con T2)
- Cubre: AC4, AC5
- Notas para el developer:
  - Lee primero `src/modules/event/components/EventCard.tsx` tal cual está hoy: contiene `formatPriceFrom` (renómbrala a `formatEventPrice` al moverla), `formatEventDate` y la función `EventStatusBadge` — muévelas literalmente (mismo comportamiento, mismos comentarios de por qué `timeZone: "UTC"`) a los nuevos archivos. No cambies su lógica, solo su ubicación. No edites `EventCard.tsx` en esta tarea — eso es T4 (evita conflicto de archivo).
  - `event.utils.ts` exporta `formatEventDate(isoDate: string): string` y `formatEventPrice(priceFrom: number, currency: string): string`.
  - `EventStatusBadge.tsx` exporta `EventStatusBadge({ status }: { status: Event["status"] })`, igual que la función actual dentro de `EventCard.tsx`.
  - En `event-service.ts`, agrega 3 categorías nuevas al array `CATEGORIES` (hoy tiene 5: Conciertos/Music, Deportes/Trophy, Teatro/Theater, Festivales/PartyPopper, Familiar/Users): `{ id: "cat-cine", label: "Cine", icon: "Film" }`, `{ id: "cat-comedia", label: "Comedia", icon: "Mic2" }`, `{ id: "cat-arte", label: "Arte y Exposiciones", icon: "Palette" }` (verifica que `Film`, `Mic2`, `Palette` existan en `lucide-react` antes de usarlos; si algún nombre no existe en la versión instalada, usa el ícono lucide más parecido disponible y documéntalo).
  - No toques mock de eventos (`EVENTS`), solo `CATEGORIES`.

### T2 — Layout sticky: Navbar, Topbar y SiteHeader
- Archivos: `src/components/ui/select.tsx`, `src/components/Navbar.tsx`, `src/components/Topbar.tsx`, `src/components/SiteHeader.tsx`
- Depende de: —
- Paralelizable: sí (con T1)
- Cubre: AC2, AC3, AC8
- Notas para el developer:
  - `npx shadcn@latest add select`.
  - En `Navbar.tsx`: el `<header>` raíz hoy tiene `className="sticky top-0 z-40 border-b border-border bg-background"`. Quita esas 4 clases de ahí (la responsabilidad sticky/fondo/borde se muda a `SiteHeader`) — cámbialo a un `<div>` simple que conserve el resto de clases internas (`mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6`) y todo su contenido igual. No cambies nada del menú móvil (`Sheet`) ni los links.
  - `Topbar.tsx`: client component (necesita `onSubmit`/`preventDefault`, mismo patrón mock que `Hero.tsx`/`Newsletter.tsx`). Fila con 3 controles + botón, responsive (`flex-col gap-3 md:flex-row md:items-center` dentro de `mx-auto max-w-7xl px-4 py-3 md:px-6`):
    - Texto: `<Input type="search" placeholder="Busca tu evento, artista o ciudad" aria-label="Buscar evento" />` (con ícono `Search` de lucide, mismo patrón visual que tenía el buscador viejo del Hero).
    - Fecha: `<Input type="date" aria-label="Fecha" />` (input nativo vía el componente `Input` ya existente — no instales un date-picker de shadcn, YAGNI).
    - Precio: `<Select>` de shadcn con opciones: "Cualquier precio" (default), "Hasta S/ 50", "S/ 50 – 150", "S/ 150 – 300", "Más de S/ 300". `aria-label="Rango de precio"` en el trigger.
    - Botón "Buscar" (`variant="cta"`, ícono `Search`), `type="submit"`, sin acción real.
  - `SiteHeader.tsx`: Server Component simple, `<header className="sticky top-0 z-40 border-b border-border bg-background"><Navbar /><Topbar /></header>` (o `<div>` si prefieres mantener el `<header>` semántico solo aquí — un solo elemento sticky para todo el bloque, verificable para AC3).
  - No toques `src/app/layout.tsx` ni `src/app/page.tsx` (fuera de tus archivos).

### T3 — Hero + HeroCarousel
- Archivos: `src/components/Hero.tsx`, `src/modules/event/components/HeroCarousel.tsx`, elimina `src/modules/event/components/FeaturedCarousel.tsx`
- Depende de: T1 (usa `event.utils.ts` y `EventStatusBadge`)
- Paralelizable: sí (con T4, una vez T1 esté listo)
- Cubre: AC1, AC6, AC8
- Notas para el developer:
  - `HeroCarousel.tsx` recibe `events: Event[]` por props (los `featured`, ya filtrados por quien lo use — no llama al service, es presentación pura, mismo criterio que tenía `FeaturedCarousel`). Usa `Carousel`/`CarouselContent`/`CarouselItem`/`CarouselPrevious`/`CarouselNext` de shadcn. Cada slide: `next/image` `fill` de fondo (`aspect-[16/7]` o una altura fija `h-[380px] md:h-[480px]`, `object-cover`), overlay `absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent`, contenido superpuesto (`absolute bottom-0 ... text-white`): `Badge` de categoría, `EventStatusBadge` (de T1), título (`text-3xl md:text-5xl font-bold`), fecha/venue con `formatEventDate` (de T1), precio con `formatEventPrice` (de T1), botón `Ver entradas` (`variant="cta"`).
  - `Hero.tsx`: conserva el H1/subheadline de marca ("Encuentra y compra entradas para tus próximos eventos" + su párrafo), **quita** el `<form>` de búsqueda y los chips de "Búsquedas populares" (se mudaron a `Topbar`, T2). Debajo del headline, renderiza `<HeroCarousel events={events} />` — recibe `events: Event[]` como prop (no llama al service, sigue siendo presentación pura pasada desde `page.tsx`).
  - Elimina `FeaturedCarousel.tsx` con `rm` — ya no se usa (T5 quita su importación en `page.tsx`).

### T4 — CategoryCard + EventCard usando utils compartidos
- Archivos: `src/modules/event/components/CategoryCard.tsx`, elimina `src/modules/event/components/CategoryChip.tsx`, `src/modules/event/components/EventCard.tsx` (modificado)
- Depende de: T1 (usa `event.utils.ts`, `EventStatusBadge`, y las 8 categorías de `event-service.ts`)
- Paralelizable: sí (con T3, una vez T1 esté listo)
- Cubre: AC4, AC5
- Notas para el developer:
  - `CategoryCard.tsx` recibe `category: EventCategory` (+ opcionalmente `index: number` para alternar color). Usa `Card` de shadcn: ícono lucide (mismo mapeo string→componente que tenía `CategoryChip`, ampliado con `Film`, `Mic2`, `Palette`) dentro de un círculo `size-12 rounded-full` con fondo alternado por índice — par: `bg-primary/10 text-primary`, impar: `bg-cta/10 text-cta` — label debajo (`text-sm font-medium text-center`). Card completa `cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5` (sin `scale`, para no desplazar layout, según checklist de `docs/design/design-system.md`). Visual/no funcional, igual que `CategoryChip` (sin filtrado real).
  - Elimina `CategoryChip.tsx` con `rm`.
  - En `EventCard.tsx`: quita las funciones locales `formatPriceFrom`, `formatEventDate` y `EventStatusBadge` (ya viven en T1) y en su lugar impórtalas: `import { formatEventDate, formatEventPrice } from "@/modules/event/event.utils"` y `import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge"`. Ajusta el único call-site que usaba `formatPriceFrom(...)` para llamar `formatEventPrice(...)` (mismo resultado). No cambies nada más del componente (mismo markup/props).

### T5 — Composición final
- Archivos: `src/app/page.tsx`
- Depende de: T2, T3, T4
- Paralelizable: no
- Cubre: AC1, AC2, AC3, AC6
- Notas para el developer:
  - Reemplaza `import { Navbar } from "@/components/Navbar"` por `import { SiteHeader } from "@/components/SiteHeader"` y `<Navbar />` por `<SiteHeader />`.
  - Elimina la sección "Eventos destacados" completa (el `<section>` que usaba `FeaturedCarousel`) — ya no existe ese componente.
  - En la sección de categorías, reemplaza `CategoryChip` por `CategoryCard` (pásale `index` si tu implementación de T4 lo pide) y cambia el contenedor `flex flex-wrap` por un `grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4`.
  - Pásale a `<Hero events={featuredEvents} />` los eventos featured (mismo array que antes usaba `FeaturedCarousel`).
  - Verifica el orden final: `SiteHeader` (sticky) → `Hero` (con `HeroCarousel`) → Categorías → Próximos eventos (`EventGrid`, sin cambios) → Cómo funciona → Newsletter → Footer.

## Preguntas abiertas

- Rangos exactos del filtro de precio en `Topbar`: se asumen 4 buckets genéricos en soles ("Hasta S/ 50", "S/ 50–150", "S/ 150–300", "Más de S/ 300") acordes a los precios del mock actual (S/ 40–300 aprox.). Ajustar si se prefieren otros cortes.
- Las 3 categorías nuevas (Cine, Comedia, Arte y Exposiciones) no tienen eventos mock propios todavía — son solo navegación visual, igual que las 5 categorías actuales no filtran `EventGrid` hoy. Si se quiere que reflejen eventos reales, es una tarea de datos para una próxima fase.

## Próximas fases

- Filtrado real por texto/fecha/precio conectado al listado de eventos.
- Autoplay/paginación por puntos en los carruseles, si se decide más adelante.
- Eventos mock para las categorías nuevas.
