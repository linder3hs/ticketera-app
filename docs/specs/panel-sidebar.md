# Sidebar unificado de Administración y Organizador

Estado: aprobada

## Objetivo

Implementar el diseño "Menú de administración" (https://claude.ai/artifact/SzXRcfH6LVYuDtQMQyb2sT, artboards `Main` y `Mobile`): un solo sidebar responsive para `/admin/*` y `/organizer/*`, con secciones por rol. Hoy `/admin` tiene un sidebar placeholder sin estilos y `/organizer` usa su propio `OrganizerShell`; se consolidan en un layout compartido.

Roles y guardas: `system-design.md §3`; permisos en `src/modules/user/user.permissions.ts` (`hasRole`).

## Alcance

- Incluye:
  - Layout compartido `src/app/(admin)/layout.tsx` que aplica el shell a todas las rutas del grupo.
  - Escritorio (`lg+`): sidebar sticky de 264 px, con botón para contraer a rail de 76 px (solo iconos, `title` como tooltip). La preferencia de colapso persiste (zustand + persist).
  - Móvil/tablet (`<lg`): topbar con hamburguesa y drawer (`Sheet` de shadcn, lado izquierdo) que se cierra al navegar.
  - Secciones: **Administración** (solo `admin` y `super_admin`) y **Organizador** (`organizer`, `admin`, `super_admin`). Un `organizer` solo ve la segunda.
  - Items (solo rutas existentes hoy): Administración → Dashboard `/admin/dashboard`, Usuarios `/admin/users`; Organizador → Resumen `/organizer`, Crear evento `/organizer/events/new`.
  - Item activo por `usePathname` con `aria-current="page"` (activo: `bg-indigo-50 text-indigo-800`).
  - Pie: "Ver sitio" (`/`), "Cerrar sesión" (Clerk) y tarjeta con nombre/correo y etiqueta de rol (`ROLE_LABEL`).
  - Migrar `organizer/page.tsx`, `organizer/events/new/page.tsx` y `admin/users/page.tsx` al layout compartido (quitar `OrganizerShell`, `Footer` y wrappers propios) y eliminar `OrganizerShell`.
- No incluye:
  - Páginas nuevas: Organizadores, Mis eventos, Check-in, Pagos (ver Preguntas abiertas).
  - Rediseñar el contenido de las páginas ni el `Navbar` público.
  - Cambios en `proxy.ts` ni en las guardas `requireRole`.

## Reutilizar

- `src/components/ui/sheet.tsx` (drawer), `Button`, `src/components/Logo.tsx` (marca).
- `hasRole`/`isRole` de `user.permissions.ts`; `ROLE_LABEL` de `role-labels.ts`; `getCurrentUser`/`requireRole` de `current-user.ts`.
- `usePersistHydration` de `src/lib/use-persist-hydration.ts` (evita mismatch al leer el colapso persistido).
- Patrón de `OrganizerShell` (sticky aside + Sheet); se reemplaza, no se duplica.
- Clerk `useClerk().signOut` para cerrar sesión.

## Archivos

Nuevos (módulo `src/modules/panel`):
- `panel.types.ts`, `panel-nav.ts` (config de secciones/items + `getNavSections(role)`), `panel-nav.test.ts`
- `panel.store.ts` (`collapsed`, `toggleCollapsed`), `panel.store.test.ts`
- `components/PanelShell.tsx`, `components/PanelSidebar.tsx`
- `src/app/(admin)/layout.tsx`

Modificados: `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/users/page.tsx`, `src/app/(admin)/organizer/page.tsx`, `src/app/(admin)/organizer/events/new/page.tsx`.
Eliminado: `src/modules/organizer/components/OrganizerShell.tsx`.

## Criterios de aceptación

- AC1: `organizer` ve solo la sección Organizador; `admin` y `super_admin` ven ambas (Administración primero).
- AC2: el item cuya ruta coincide con el pathname queda activo (`aria-current="page"`, estilo indigo); `/organizer/events/new` activa "Crear evento", no "Resumen".
- AC3: en `lg+` el botón contrae/expande el sidebar (264 ↔ 76 px); en rail se ocultan labels y headings, los items conservan `title` y `aria-label`; el estado persiste tras recargar sin warning de hidratación.
- AC4: en `<lg` hay topbar con botón "Abrir menú" y drawer a la izquierda; elegir un item cierra el drawer.
- AC5: pie con "Ver sitio", "Cerrar sesión" (cierra sesión Clerk y vuelve a `/`) y tarjeta de usuario con rol.
- AC6: las páginas `/admin/users`, `/admin/dashboard`, `/organizer` y `/organizer/events/new` se renderizan dentro del mismo shell; no queda `OrganizerShell` ni sidebar placeholder.
- AC7: targets ≥44 px, foco visible, texto con contraste AA; navegación completa por teclado.
- AC8: las guardas `requireRole` siguen activas (un `customer` es redirigido; un `organizer` no entra a `/admin/*`).
- AC9: `npm run lint`, `npx vitest run` y `npm run build` pasan.

## Tests requeridos

- `panel-nav.test.ts`: `getNavSections` por rol (AC1) y resolución del item activo por pathname, incl. `/organizer` vs `/organizer/events/new` (AC2).
- `panel.store.test.ts`: `toggleCollapsed` alterna el estado (AC3).
- Componentes visuales sin test (SETUP.md §3).

## Tareas

### T1 — Lógica del módulo panel
- Archivos: `src/modules/panel/panel.types.ts`, `panel-nav.ts`, `panel-nav.test.ts`, `panel.store.ts`, `panel.store.test.ts`
- Depende de: —
- Paralelizable: sí
- Cubre: AC1, AC2, AC3 (lógica)

### T2 — UI del shell y sidebar
- Archivos: `src/modules/panel/components/PanelShell.tsx`, `src/modules/panel/components/PanelSidebar.tsx`
- Depende de: T1
- Paralelizable: no
- Cubre: AC3, AC4, AC5, AC7

### T3 — Rutas y migración
- Archivos: `src/app/(admin)/layout.tsx`, `src/app/(admin)/admin/layout.tsx`, `src/app/(admin)/admin/users/page.tsx`, `src/app/(admin)/organizer/page.tsx`, `src/app/(admin)/organizer/events/new/page.tsx`, `src/modules/organizer/components/OrganizerShell.tsx` (eliminar)
- Depende de: T2
- Paralelizable: no
- Cubre: AC6, AC8, AC9

## Preguntas abiertas

1. Items sin ruta hoy (Organizadores, Mis eventos, Check-in, Pagos): se **omiten** (YAGNI; se agregan en `panel-nav.ts` cuando exista la página). ¿O prefieres verlos deshabilitados con "Pronto"? La aprobación de organizadores ya vive en `/admin/users`.
2. ¿`admin`/`super_admin` ven también la sección Organizador? Se asume que sí (diseño); pasarían las guardas por jerarquía de roles.
3. `admin/dashboard/page.tsx` es un placeholder con typos ("Dasboard"/"Dashbaord"); queda fuera de esta spec salvo que lo pidas.
4. `OrganizerShell` usa `auth.store` (login mock) para nombre y logout; el nuevo shell usa Clerk. Si `auth.store` queda sin usos tras esto, ¿se elimina en otra spec?

## Próximas fases

- Páginas Mis eventos, Check-in, Pagos y Organizadores con sus items.
- Badge de pendientes en Organizadores.
