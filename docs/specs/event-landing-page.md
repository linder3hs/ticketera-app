# Landing page de eventos (mock data)

Estado: aprobada

## Objetivo

Construir la UI de la landing page de la ticketera (`/`) usando mock data para eventos, siguiendo `docs/design/design-system.md` (ya aprobado como insumo de diseño: paleta, tipografía Poppins, estructura de secciones, mapeo a shadcn). Esta spec traduce ese documento en tareas de implementación — no re-decide colores, tipografía ni estructura.

Referencias visuales ya resueltas en el design doc: [Ticketmaster](https://www.ticketmaster.com/), [Joinnus](https://www.joinnus.com/).

## Alcance

- Incluye:
  - Wiring de Poppins (`next/font/google`) y tokens de color nuevos (`--cta`, `--cta-foreground`, `--success`, `--primary` indigo) en `layout.tsx` / `globals.css`.
  - `next.config.ts` con `remotePatterns` para imágenes de Unsplash.
  - Módulo `event`: types, service con mock data (in-memory, sin fetch real), componentes de evento/categoría/carrusel/grid.
  - Componentes de shell y secciones de marketing sin lógica de dominio: Navbar, Footer, Hero (buscador no funcional), "Cómo funciona", Newsletter (formulario no funcional).
  - Composición final en `src/app/page.tsx`.
  - Instalación de componentes shadcn faltantes: `card`, `input`, `badge`, `carousel`, `sheet`, `separator` (vía `npx shadcn@latest add`).
- No incluye:
  - Dark mode (el bloque `.dark` de `globals.css` queda intacto, sin usarse ni extenderse).
  - Lógica real de búsqueda, filtrado por categoría, autenticación o checkout — todo botón/input de esas acciones es visual/no funcional.
  - `QueryClientProvider`, `zustand` store o cualquier fetching real — los datos son estáticos, se leen directo del service en un Server Component.
  - Instalar Swiper u otra librería de slider — el `carousel` de shadcn (embla) cubre la necesidad.
  - Páginas de detalle de evento, checkout, login (fuera de esta etapa).

## Reutilizar

- `src/components/ui/button.tsx` — ya existe, usar variantes existentes + agregar variante `cta` (naranja) vía `class-variance-authority`, que ya está instalado.
- `src/lib/utils.ts` (`cn()`) — para merge de clases en todos los componentes nuevos.
- `lucide-react` — ya instalado, para todos los iconos (buscador, categorías, pasos de "Cómo funciona", menú móvil). No instalar otra librería de iconos.
- `class-variance-authority` — ya instalado, para la variante `cta` del botón.

## Archivos

**T0 (base, compartido):**

- `src/app/globals.css` (modificado)
- `src/app/layout.tsx` (modificado)
- `next.config.ts` (modificado)
- `src/components/ui/button.tsx` (modificado — variante `cta`)
- `src/components/ui/card.tsx`, `input.tsx`, `badge.tsx`, `carousel.tsx`, `sheet.tsx`, `separator.tsx` (nuevos, generados por `npx shadcn@latest add`)

**T1 (dominio event — datos):**

- `src/modules/event/event.types.ts` (nuevo)
- `src/modules/event/services/event-service.ts` (nuevo)
- `src/modules/event/services/event-service.test.ts` (nuevo)

**T2 (dominio event — UI):**

- `src/modules/event/components/EventCard.tsx` (nuevo)
- `src/modules/event/components/CategoryChip.tsx` (nuevo)
- `src/modules/event/components/FeaturedCarousel.tsx` (nuevo)
- `src/modules/event/components/EventGrid.tsx` (nuevo)

**T3 (shell y secciones de marketing):**

- `src/components/Navbar.tsx` (nuevo)
- `src/components/Footer.tsx` (nuevo)
- `src/components/Hero.tsx` (nuevo)
- `src/components/HowItWorks.tsx` (nuevo)
- `src/components/Newsletter.tsx` (nuevo)

**T4 (composición):**

- `src/app/page.tsx` (modificado)

## Criterios de aceptación

- AC1: `npm run build` compila sin errores y `/` renderiza, en orden: Navbar → Hero (con buscador) → Categorías → Carrusel de eventos destacados → Grid de próximos eventos → "Cómo funciona" → Newsletter → Footer.
- AC2: Toda la tipografía usa Poppins vía `next/font/google` mapeada a la variable `--font-sans` que `globals.css` ya espera (`@theme inline` → `--font-sans: var(--font-sans)`); no queda ninguna referencia a Geist Sans en `layout.tsx`. Si nada usa `font-mono`, se elimina `Geist_Mono`; si algo lo usa, se mantiene.
- AC3: `globals.css` define en `:root` los tokens `--primary` (indigo-600), `--cta`, `--cta-foreground`, `--success`, y los mapea en `@theme inline` (mismo patrón que `--color-primary`, `--color-destructive`, etc.). `--accent` de shadcn no se toca.
- AC4: Los componentes de landing están construidos mayoritariamente con primitivos shadcn ya listados (`button`, `card`, `input`, `badge`, `carousel`, `sheet`, `separator`); no se agrega Swiper ni otra librería de slider/iconos nueva.
- AC5: `event-service.ts` expone `getFeaturedEvents()`, `getUpcomingEvents()` y `getCategories()` (mock, in-memory) y `event-service.test.ts` cubre los tres con `npx vitest run`.
- AC6: Cada evento mock usa una URL real de imagen de Unsplash, renderizada con `next/image`, con `alt` descriptivo; `next.config.ts` tiene `images.remotePatterns` para `images.unsplash.com`.
- AC7: El menú móvil (`Sheet`) abre y cierra, y `FeaturedCarousel` es navegable con flechas (y swipe/drag, comportamiento nativo de embla).
- AC8: Checklist mínimo de accesibilidad del design doc: `cursor-pointer` en toda card/elemento clicable, `focus-visible:ring` visible en inputs/botones/links, botones solo-ícono con `aria-label`, sin scroll horizontal accidental entre 375px y 1440px, sin dark mode aplicado.

## Tests requeridos

- `src/modules/event/services/event-service.test.ts` (Vitest) — cubre AC5: `getFeaturedEvents`, `getUpcomingEvents`, `getCategories` devuelven arrays no vacíos con la forma esperada (`Event[]` / `EventCategory[]`).
- No se requieren tests para `EventCard`, `CategoryChip`, `FeaturedCarousel`, `EventGrid`, `Navbar`, `Footer`, `Hero`, `HowItWorks`, `Newsletter` (componentes puramente visuales, sin lógica de negocio — SETUP.md los exime).

## Tareas

### T0 — Base compartida: tokens, fuente, config, shadcn

- Archivos: `src/app/globals.css`, `src/app/layout.tsx`, `next.config.ts`, `src/components/ui/button.tsx`, `src/components/ui/{card,input,badge,carousel,sheet,separator}.tsx`
- Depende de: —
- Paralelizable: no (es la base; T1 sí puede correr en paralelo con T0 porque no toca ninguno de estos archivos, pero T2/T3/T4 dependen de T0)
- Cubre: AC2, AC3, AC4, AC6
- Notas para el developer:
  - Ejecutar `npx shadcn@latest add card input badge carousel sheet separator` (no `tabs` ni `skeleton` ni `avatar` — no se usan en esta fase, YAGNI).
  - Reemplazar `Geist({ variable: "--font-geist-sans", ... })` por `Poppins({ subsets: ["latin"], weight: ["400","500","600","700"], variable: "--font-sans" })`, aplicar `poppins.variable` en el `className` de `<html>`. Revisar si `font-mono` se usa en algún componente antes de decidir si mantener `Geist_Mono`.
  - En `globals.css`, agregar en `:root`: `--primary: #4F46E5; --primary-foreground: #FFFFFF; --cta: #F97316; --cta-foreground: #FFFFFF; --success: #16A34A;` y en `@theme inline` agregar `--color-cta: var(--cta); --color-cta-foreground: var(--cta-foreground); --color-success: var(--success);` (además de asegurar que `--color-primary`/`--color-primary-foreground` ya existentes sigan mapeando igual). No tocar `--accent`.
  - En `button.tsx`, agregar variante `cta` (fondo `bg-cta text-cta-foreground`, hover ligeramente más oscuro) al objeto de variantes existente (`class-variance-authority`), sin romper las variantes actuales.
  - En `next.config.ts`, agregar `images: { remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }] }`.

### T1 — Módulo event: types y service (mock data)

- Archivos: `src/modules/event/event.types.ts`, `src/modules/event/services/event-service.ts`, `src/modules/event/services/event-service.test.ts`
- Depende de: —
- Paralelizable: sí (con T0)
- Cubre: AC5
- Notas para el developer:
  - `event.types.ts`: exportar `interface Event { id: string; title: string; category: string; imageUrl: string; imageAlt: string; date: string; venue: string; city: string; priceFrom: number; currency: string; status: "available" | "last-tickets" | "sold-out"; featured: boolean }` y `interface EventCategory { id: string; label: string; icon: string }` (`icon` = nombre de icono lucide, ej. `"Music"`, `"Trophy"`, `"Theater"`).
  - `event-service.ts`: mock data in-memory (mínimo 8–10 eventos variados en categoría/ciudad, al menos 3 con `featured: true`, con URLs reales de Unsplash — buscar fotos de conciertos/deportes/teatro). Exportar `async function getFeaturedEvents(): Promise<Event[]>`, `async function getUpcomingEvents(): Promise<Event[]>`, `async function getCategories(): Promise<EventCategory[]>` (async aunque sea mock, para que el cambio a fetch real después no rompa la firma).
  - Test: verificar longitud > 0 y forma básica de cada función.

### T2 — Módulo event: componentes de UI

- Archivos: `src/modules/event/components/EventCard.tsx`, `CategoryChip.tsx`, `FeaturedCarousel.tsx`, `EventGrid.tsx`
- Depende de: T0, T1
- Paralelizable: sí (con T3, una vez T0 y T1 estén listos)
- Cubre: AC1, AC4, AC6, AC7, AC8
- Notas para el developer:
  - `EventCard`: `Card` de shadcn, imagen `next/image` (`aspect-video`, `rounded-t-xl`), `Badge` de categoría y de estado (`sold-out` → `destructive`, `last-tickets` → variante con `--cta` o `--destructive` suave, `available` → sin badge o `--success`), título, fecha/ciudad, precio desde, botón "Ver entradas" (`variant="cta"`).
  - `CategoryChip`: botón tipo chip (`rounded-full`) con ícono lucide (mapear string `icon` → componente, ej. objeto `{ Music, Trophy, ... }` de `lucide-react`) — visual/no funcional (sin filtrado real).
  - `FeaturedCarousel`: `Carousel`/`CarouselContent`/`CarouselItem`/`CarouselPrevious`/`CarouselNext` de shadcn envolviendo `EventCard` (o una variante más grande) para los eventos con `featured: true`.
  - `EventGrid`: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6` de `EventCard`.
  - Todo elemento clicable con `cursor-pointer` y estados de foco visibles.

### T3 — Shell y secciones de marketing

- Archivos: `src/components/Navbar.tsx`, `Footer.tsx`, `Hero.tsx`, `HowItWorks.tsx`, `Newsletter.tsx`
- Depende de: T0
- Paralelizable: sí (con T2)
- Cubre: AC1, AC7, AC8
- Notas para el developer:
  - `Navbar`: logo/nombre, links (Eventos, Categorías, Cómo funciona — anclas a secciones de la misma landing), botón "Iniciar sesión" (visual), CTA "Vender entradas" (visual), menú móvil con `Sheet` (client component, estado local `useState`, sin hook custom — un solo uso).
  - `Hero`: headline + subheadline, `Input` + `Button` de búsqueda (no funcional, `onSubmit` con `preventDefault` sin acción), chips de búsquedas populares (texto estático).
  - `HowItWorks`: 3 pasos (Buscar → Elegir → Comprar) con íconos lucide, sin lógica.
  - `Newsletter`: `Input` + `Button`, franja con `bg-muted`, formulario no funcional.
  - `Footer`: columnas de links estáticos, `Separator`, copyright.

### T4 — Composición de la landing

- Archivos: `src/app/page.tsx`
- Depende de: T2, T3
- Paralelizable: no
- Cubre: AC1
- Notas para el developer:
  - Server Component (sin `"use client"`): `await` directo a `getFeaturedEvents()`, `getUpcomingEvents()`, `getCategories()` del service (T1), pasar como props a los componentes de T2/T3 en el orden de AC1.
  - Actualizar `metadata` (title/description) del proyecto en `layout.tsx` si no se hizo en T0 (ej. "Ticketera — Compra entradas para tus eventos favoritos").

## Preguntas abiertas

- Contenido/mercado de los eventos mock: dado que se toman como referencia Ticketmaster (global) y Joinnus (Perú), se asume por defecto una mezcla de eventos en ciudades de Perú (Lima, Arequipa) más 1–2 internacionales, para reflejar ambas referencias. Si se prefiere un mercado específico, ajustar en T1.
- Nombre/marca del proyecto para el `<title>` y el logo del Navbar: se usará "Ticketera" como placeholder (T0/T4) hasta que se indique un nombre definitivo.

## Próximas fases

- Página de detalle de evento (`/events/[id]`) con selección de asiento/cantidad.
- Búsqueda y filtrado por categoría real (probablemente con `nuqs`/query params o estado en `zustand`).
- Flujo de checkout y autenticación.
- Dark mode (si se decide agregar más adelante).
