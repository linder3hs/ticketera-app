# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

@docs/SETUP.md

## Commands

- `npm run dev` — start dev server (Turbopack, http://localhost:3000)
- `npm run build` — production build (Turbopack)
- `npm run start` — run the production build
- `npm run lint` — ESLint (flat config via `eslint-config-next`)
- `npm test` — Vitest in watch mode; `npx vitest run` for a single pass
- Single test file: `npx vitest run src/lib/utils.test.ts`; single test by name: `npx vitest run -t "merges class names"`

## Workflow: SDD agents

`docs/SETUP.md` (imported above) is the source of truth for folder structure, naming, good practices and methodology. Development follows Spec Driven Development with four project agents in `.claude/agents/`:

- **`orchestrator`** — entry point for any non-trivial development task. Decides BUILD (do it directly) vs SDD. In SDD it runs in two calls: phase A generates the spec; phase B (only after human approval) dispatches developers — in parallel when their files don't overlap — and runs the review loop (max 2 correction rounds).
- **`spec`** — writes `docs/specs/<slug>.md` (max 5 tasks, one owner per file, always `Estado: borrador`).
- **`developer`** — implements one task, touching only the files it owns.
- **`reviewer`** — read-only; validates against the spec and SETUP.md, returns `PASS` or `FAIL` with `file:line` findings.

**Human approval is blocking.** A spec moves from `Estado: borrador` to `Estado: aprobada` only when the human explicitly approves it in chat (e.g. "apruebo docs/specs/<slug>.md"); only then edit that line and call the orchestrator for phase B. Never approve a spec on your own initiative or because an agent asks. The `PreToolUse` hook `.claude/hooks/require-approved-spec.mjs` (registered in `.claude/settings.json`) rejects launching `developer` unless its prompt references an approved spec; its tests run with `npx vitest run`.

## Architecture

Next.js 16 App Router project (React 19, TypeScript, Turbopack) scaffolded with `create-next-app`, using `src/` and the `@/*` path alias (`src/*`).

Stack in place:

- **Styling**: Tailwind CSS v4 (no `tailwind.config`; config lives in `src/app/globals.css` via `@theme`/CSS variables).
- **UI components**: shadcn/ui, style `base-nova`, base color `neutral`, icon library `lucide-react`. Config in `components.json` — install new components with `npx shadcn@latest add <component>`; they land in `src/components/ui`. Aliases: `@/components`, `@/components/ui`, `@/lib`, `@/hooks`.
- **Data fetching**: `axios` for HTTP, `@tanstack/react-query` for server-state caching (no `QueryClientProvider` wired up yet — add one in `src/app/layout.tsx` or a client-side providers wrapper before using query hooks).
- **Tables**: `@tanstack/react-table` (headless — pair with shadcn `table` component for markup).
- **Client state**: `zustand`.
- **Validation**: `zod`.
- **Class merging**: `src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge), used by shadcn components.

## Important: read AGENTS.md first

This is Next.js 16, not the version in your training data — APIs, conventions, and file structure differ. The `AGENTS.md` file (imported above) is regenerated automatically by `next dev`; it points to the version-specific docs in `node_modules/next/dist/docs/`. Read those docs before writing Next.js code, and keep that block intact when committing — removing it just gets re-added as an uncommitted diff.
