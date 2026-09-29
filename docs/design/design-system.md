# Design System — Ticketera

Documento de diseño para la landing page (y base para páginas futuras). Generado con `ui-ux-pro-max` y ajustado a los requisitos del proyecto: **solo modo claro**, look "moderno sin sobrecargar", referencias visuales [Ticketmaster](https://www.ticketmaster.com/) y [Joinnus](https://www.joinnus.com/).

## 1. Principios

- **Neutral-first**: la base es la escala neutral de shadcn (`components.json` → `baseColor: neutral`). El color aparece solo donde importa: CTA de compra, precios, badges de categoría.
- **Dos acentos, no más**: `primary` (marca/navegación/enlaces) y `cta` (comprar entrada). Nunca introducir un tercer color de marca.
- **Cards como unidad base**: eventos, categorías y secciones se apoyan en `Card` de shadcn con esquinas redondeadas y sombra suave — nunca sombras duras ni bordes de alto contraste.
- **Sin emojis como iconos** — todo ícono es `lucide-react`.

## 2. Paleta de color (modo claro único)

Definir como variables CSS en `src/app/globals.css` (Tailwind v4, bloque `@theme`), no en `tailwind.config`.

| Token | Hex | Uso |
|---|---|---|
| `--background` | `#FFFFFF` | Fondo base |
| `--muted` / `--muted-foreground` | `#F4F4F5` / `oklch(0.439 0 0)` (≈`#525252`) | Fondos de sección alterna, texto secundario (el `#71717A` original no llegaba a 4.5:1 sobre `--muted`) |
| `--foreground` | `#18181B` | Texto principal |
| `--border` | `#E4E4E7` | Bordes de cards, separadores |
| `--primary` | `#4F46E5` (indigo-600) | Navbar activo, links, botones secundarios, iconografía de marca |
| `--primary-foreground` | `#FFFFFF` | Texto sobre `primary` |
| `--accent` / `--accent-foreground` | shadcn defaults (neutral) | **No tocar** — es el hover neutral que shadcn usa en botones ghost, items de menú, `sheet`, etc. Redefinirlo en naranja pintaría de CTA cualquier hover de la app. |
| `--cta` (token nuevo, no shadcn) | `#F97316` (orange-500) | Botón "Comprar entradas", precios destacados, badges de urgencia ("Últimas entradas") — variante propia de `button`, no el `--accent` de shadcn |
| `--cta-foreground` (token nuevo) | `#18181B` | Texto sobre `--cta` (blanco sobre `#F97316` da ~2.8:1; oscuro da ~6:1) |
| `--secondary` | `#F4F4F5` | Botones secundarios, chips de categoría inactivos |
| `--destructive` | `#DC2626` | Errores, "Agotado" |
| `--success` (token nuevo) | `#16A34A` | "Disponible", confirmaciones |

**Regla de uso**: `primary` (índigo) = identidad y navegación. `cta` (naranja) = acción de compra, vía una variante custom `cta` del componente `button` (usar `class-variance-authority`, ya en el proyecto). Nunca ambos compitiendo por atención en el mismo componente (p. ej. un card de evento usa borde/hover en neutral, precio en `cta`, categoría en `primary` suave). `--accent` de shadcn se deja en su valor neutral por defecto.

Añadir los tokens nuevos (`--cta`, `--cta-foreground`, `--success`) junto a los existentes en `:root` de `globals.css`, y mapearlos en el bloque `@theme inline` como `--color-cta: var(--cta)`, etc. — mismo patrón que ya usan `--color-primary`, `--color-destructive`, etc.

## 3. Tipografía — Poppins en todo el proyecto

Una sola familia para toda la UI (headings y body), como pidió el usuario. Variación por *peso*, no por familia.

El scaffold actual (`src/app/globals.css`) ya espera una variable `--font-sans` (el bloque `@theme inline` mapea `--font-sans: var(--font-sans)` y `--font-heading: var(--font-sans)`, y `html` aplica `font-sans` vía `@layer base`). Hoy esa variable no la define nadie — `layout.tsx` solo declara `--font-geist-sans`/`--font-geist-mono`, que ninguna clase Tailwind consume. Reemplazar Geist Sans por Poppins usando **el mismo nombre de variable que el scaffold ya espera**, sin tocar `globals.css` para esto:

```ts
// src/app/layout.tsx
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
```

Y aplicar `poppins.variable` en el `className` de `<html>` (reemplazando `geistSans.variable`). `Geist_Mono` puede conservarse solo si algo usa `font-mono`; si no, eliminarlo — no crear un `--font-poppins` nuevo ni reintroducir el `@import` de Google Fonts en CSS (duplicaría la carga de la fuente que `next/font` ya hace self-hosted).

| Elemento | Tamaño | Peso | Clase Tailwind |
|---|---|---|---|
| H1 (hero) | 36–48px | 700 | `text-4xl md:text-5xl font-bold` |
| H2 (sección) | 28–32px | 600 | `text-2xl md:text-3xl font-semibold` |
| H3 (card title) | 18–20px | 600 | `text-lg font-semibold` |
| Body | 16px | 400 | `text-base font-normal` |
| Small / meta | 14px | 400–500 | `text-sm text-muted-foreground` |
| Precio / CTA text | 16–18px | 600 | `text-lg font-semibold` |

`line-height`: 1.5–1.6 en body, 1.2 en headings. Mínimo 16px en móvil.

## 4. Espaciado y layout

- Contenedor: `max-w-7xl mx-auto px-4 md:px-6`.
- Separación entre secciones: `py-16 md:py-24`.
- Grid de eventos: `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6`.
- Radios: cards `rounded-xl` (12px), botones `rounded-lg`, chips/badges `rounded-full`.
- Sombra: `shadow-sm` en reposo, `shadow-md` en hover (sin transform de escala que desplace layout — solo color/shadow/translate-y-1 sutil).
- Transiciones: `transition-colors duration-200` / `duration-300` para hover de cards.

## 5. Estilo visual elegido

Mezcla de **"Bento/Card modularity"** (Apple-style, cards limpias, jerarquía por tamaño) + patrón de landing **"Marketplace/Directory"** (hero con búsqueda como CTA principal, categorías visuales, listado destacado). Se descarta el estilo "Vibrant & Block-based" (demasiado saturado) y "Flat Design" de colores planos brillantes — no encajan con "moderno sin sobrecargar".

Referencia de composición: Ticketmaster (hero con buscador + filtros, grid de eventos con imagen dominante) y Joinnus (categorías por chips, cards con fecha/lugar/precio visibles sin abrir el evento).

## 6. Estructura de la landing (secciones)

1. **Navbar** — logo, links (Eventos, Categorías, Cómo funciona), buscador compacto (desktop), botón "Iniciar sesión" + CTA "Vender entradas" o similar, menú móvil.
2. **Hero** — headline + subheadline, buscador prominente (evento/artista/ciudad), chips de búsquedas populares.
3. **Categorías** — fila de chips/cards con ícono (Conciertos, Deportes, Teatro, Festivales, Familiar) — filtro visual, no funcional en esta etapa (mock).
4. **Eventos destacados** — carrusel (shadcn `carousel`, basado en embla) con cards grandes (imagen + título + fecha + ciudad + precio desde).
5. **Próximos eventos** — grid de `EventCard` (imagen, badge categoría, título, fecha/lugar, precio, botón "Ver entradas").
6. **Cómo funciona** — 3 pasos simples (Buscar → Elegir → Comprar), iconos lucide.
7. **Newsletter / CTA final** — input + botón, franja con `--muted` de fondo.
8. **Footer** — columnas (Compañía, Ayuda, Legal, Redes), separador, copyright.

## 7. Mapeo a componentes shadcn (evitar crear desde cero)

| Sección/necesidad | Componente shadcn | Notas |
|---|---|---|
| Botones (CTA, secundarios) | `button` | variantes `default` (primary), y una custom `cta` vía `class-variance-authority` ya usado en el proyecto |
| Buscador hero/navbar | `input` (+ `button` con ícono `Search`) | |
| Cards de evento/categoría | `card` | `CardHeader`, `CardContent`, `CardFooter` |
| Imagen de evento con proporción fija | clases Tailwind `aspect-video` / `aspect-[4/5]` | no hace falta el primitive `aspect-ratio` de shadcn (Base UI, detrás de `base-nova`, no lo trae) — la utilidad de Tailwind ya evita layout shift |
| Categoría/estado (badge) | `badge` | "Agotado", "Últimas entradas", categoría |
| Carrusel de destacados | `carousel` (embla) | **cubre la necesidad de "slider" — no hace falta instalar Swiper** |
| Menú móvil | `sheet` | off-canvas nav |
| Filtro de categorías (alterno a chips) | `tabs` | opcional si se prefiere tabs sobre chips |
| Separadores de footer | `separator` | |
| Estado de carga de imágenes/cards | `skeleton` | opcional, sólo si se agrega loading state |
| Avatar de organizador (si aplica) | `avatar` | opcional |

Componentes a instalar (`npx shadcn@latest add ...`): `button card input badge carousel sheet separator tabs skeleton` (ajustar lista final en la spec según lo que realmente use cada task).

## 8. Iconografía e imágenes

- Iconos: `lucide-react` (ya instalado). Tamaño consistente `w-5 h-5` / `w-6 h-6`.
- Imágenes de eventos: fotos reales de internet (Unsplash) vía `next/image` con `remotePatterns` configurado en `next.config.ts` para el/los dominios usados (p. ej. `images.unsplash.com`). Todas con `alt` descriptivo.
- Proporción de imagen de card: `aspect-video` (16:9) o `aspect-[4/5]` en el carrusel hero.

## 9. Accesibilidad y detalles de calidad (checklist)

- [ ] Contraste texto/fondo ≥ 4.5:1 (validar `--muted-foreground` sobre blanco y sobre `--muted`)
- [ ] `cursor-pointer` en cards y elementos clicables
- [ ] Estados de foco visibles (`focus-visible:ring`) en inputs, botones, links
- [ ] Botones con `aria-label` cuando son solo-ícono (ej. favorito, menú móvil)
- [ ] `prefers-reduced-motion` respetado en animaciones del carrusel
- [ ] Responsive verificado en 375px, 768px, 1024px, 1440px
- [ ] Sin scroll horizontal accidental
- [ ] Todas las imágenes con `alt`

## 10. Fuera de alcance (esta etapa)

- Dark mode (explícitamente solo claro).
- Lógica real de búsqueda/filtrado/checkout — todo con mock data.
- Autenticación real.
