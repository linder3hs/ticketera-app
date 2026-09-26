# next-js-template

Template base de Next.js 16 para arrancar proyectos de cualquier dominio, con una estructura modular, buenas prácticas definidas y un flujo de trabajo **Spec Driven Development (SDD)** asistido por agentes de Claude Code.

## Stack

| Área | Herramienta |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Estilos | Tailwind CSS v4 |
| UI | shadcn/ui (`base-nova`, iconos `lucide-react`) |
| Datos | axios + TanStack Query |
| Tablas | TanStack Table |
| Estado cliente | zustand |
| Validación | zod |
| Testing | Vitest |

## Inicio rápido

Requisitos: Node.js 22 o superior (recomendado 24 LTS).

```bash
git clone https://github.com/linder3hs/next-js-template.git mi-proyecto
cd mi-proyecto
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Sirve el build de producción |
| `npm run lint` | ESLint |
| `npm test` | Vitest en modo watch |
| `npx vitest run` | Vitest una sola pasada (CI) |

## Estructura y reglas

Todas las reglas del proyecto viven en [`docs/SETUP.md`](docs/SETUP.md):

- **Estructura modular por dominio** en `src/modules/<domain>`; `src/app` solo contiene rutas.
- **Naming** en inglés con convenciones por tipo de archivo (componentes, hooks, services, schemas, stores, types).
- **Buenas prácticas**: SOLID, DRY, KISS y YAGNI. Antes de crear algo, verificar si ya existe en el proyecto o en shadcn.
- **Testing** con Vitest para services, hooks, stores, schemas y `src/lib`.

## Flujo de trabajo con Claude Code (SDD)

El proyecto incluye cuatro agentes en [`.claude/agents/`](.claude/agents/):

| Agente | Rol |
|---|---|
| `orchestrator` | Punto de entrada. Decide si la tarea va en modo **BUILD** (cambio directo) o **SDD**, coordina a los demás y controla el loop de review. |
| `spec` | Escribe la spec en `docs/specs/<slug>.md`: alcance, criterios de aceptación y máximo 5 tareas con archivos asignados. |
| `developer` | Implementa una tarea tocando solo sus archivos; varios pueden trabajar en paralelo sin conflictos. |
| `reviewer` | Valida contra la spec y `docs/SETUP.md`. Devuelve `PASS` o `FAIL` con hallazgos; máximo 2 rondas de corrección. |

Cómo se usa:

1. Pide la tarea en lenguaje natural (por ejemplo, "agrega un módulo de productos con listado y formulario").
2. Si es SDD, el orchestrator genera la spec en `Estado: borrador` y se detiene.
3. Revisa la spec y apruébala en el chat: `apruebo docs/specs/<slug>.md`.
4. El orchestrator lanza los developers y el reviewer hasta obtener `PASS`.

**La aprobación humana es obligatoria.** Un hook del proyecto ([`.claude/hooks/require-approved-spec.mjs`](.claude/hooks/require-approved-spec.mjs)) bloquea al agente `developer` si la spec no tiene `Estado: aprobada`.

## Skills recomendadas

Estas skills complementan el template. Se instalan dentro de Claude Code (los comandos `/plugin` se escriben en el prompt; `npx skills` se ejecuta en la terminal).

| Skill | Para qué sirve en este template | Instalación |
|---|---|---|
| **superpowers** | Metodología: brainstorming antes de construir, planes, TDD y debugging sistemático. Encaja con SDD y con Vitest. | `/plugin install superpowers@claude-plugins-official` |
| **ponytail** | Fuerza la solución más simple que funciona (stdlib y dependencias existentes primero). Refuerza KISS y YAGNI. | `/plugin marketplace add DietrichGebert/ponytail`<br>`/plugin install ponytail@ponytail` |
| **caveman** | Respuestas de Claude comprimidas: menos tokens, mismo contenido técnico. El código, los commits y los PRs se escriben normal. | `/plugin marketplace add JuliusBrussee/caveman`<br>`/plugin install caveman@caveman` |
| **frontend-design** | Interfaces con dirección visual propia, evitando el look genérico de "hecho por IA". | `/plugin install frontend-design@claude-plugins-official` |
| **ui-ux-pro-max** | Base de conocimiento UI/UX: estilos, paletas, tipografías, accesibilidad y patrones para shadcn/Tailwind. | `/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill`<br>`/plugin install ui-ux-pro-max@ui-ux-pro-max-skill` |
| **vercel-labs** (agent-skills) | `react-best-practices` (rendimiento en React/Next.js) y `web-design-guidelines` (revisión de UI y accesibilidad), entre otras. | `npx skills add vercel-labs/agent-skills` |

Si `claude-plugins-official` no aparece como marketplace, agrégalo con `/plugin marketplace add anthropics/claude-plugins-official`.

Cómo combinarlas:

- **Planificar**: `superpowers` para explorar la idea y el orchestrator para bajarla a una spec.
- **Construir UI**: `frontend-design` y `ui-ux-pro-max` para el diseño; shadcn para los componentes.
- **Revisar**: `vercel-labs` (`react-best-practices`, `web-design-guidelines`) además del agente `reviewer`.
- **Durante toda la sesión**: `ponytail` para no sobre-construir y `caveman` para ahorrar tokens. Se desactivan con `stop ponytail` y `stop caveman`.

## Documentación relacionada

- [`docs/SETUP.md`](docs/SETUP.md): estructura, naming, buenas prácticas y metodología.
- [`CLAUDE.md`](CLAUDE.md): instrucciones que Claude Code carga en cada sesión.
- [`AGENTS.md`](AGENTS.md): aviso de Next.js 16 (generado por `next dev`).
