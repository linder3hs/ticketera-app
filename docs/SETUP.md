# SETUP.md

Reglas de estructura de carpetas, buenas prácticas y metodología de trabajo para este proyecto.

## 1. Estructura de carpetas

- **Modular por dominio**: todo el código de negocio vive dentro de un módulo en `src/modules/<domain>`. Un módulo agrupa todo lo que pertenece a ese dominio: componentes, hooks, servicios, tipos y schemas.
- **Nombres en inglés**: carpetas, archivos, variables, funciones, tipos — todo en inglés (`user`, `order`, `auth`), nunca en español.
- **App Router (`src/app`) solo contiene rutas**: `page.tsx`, `layout.tsx`, `route.ts`, `loading.tsx`, `error.tsx`, etc. No debe haber lógica de dominio dentro de `src/app`; cada archivo de ruta importa lo que necesita desde el módulo correspondiente en `src/modules`.
- **Componentes UI compartidos** (shadcn y genéricos, sin lógica de dominio) van en `src/components/ui`. Componentes compartidos entre módulos pero con algo de lógica de negocio van en `src/components`.

### Reglas de naming (TypeScript)

| Tipo | Convención | Ejemplo de archivo | Export |
|---|---|---|---|
| Componente | PascalCase | `UserCard.tsx` | `export function UserCard() {}` |
| Hook | kebab-case, prefijo `use-` | `use-user.ts` | `export function useUser() {}` |
| Service | kebab-case, sufijo `-service` | `user-service.ts` | `export async function getUser() {}` |
| Schema (zod) | kebab-case, sufijo `.schema` | `user.schema.ts` | `export const userSchema = z.object({...})` |
| Store (zustand) | kebab-case, sufijo `.store` | `user.store.ts` | `export const useUserStore = create(...)` |
| Types/interfaces | kebab-case, sufijo `.types` | `user.types.ts` | `export interface User {...}` |

### Ejemplo: módulo `user`

```
src/
  app/
    users/
      page.tsx          # ruta -> importa desde src/modules/user
  modules/
    user/
      components/
        UserCard.tsx
        UserForm.tsx
      hooks/
        use-user.ts
        use-users.ts
      services/
        user-service.ts
      user.schema.ts
      user.store.ts
      user.types.ts
  components/
    ui/
      button.tsx         # shadcn
  lib/
    utils.ts
```

`src/app/users/page.tsx` no contiene lógica: importa `UserCard` y `useUsers` desde `src/modules/user` y compone la vista.

## 2. Buenas prácticas

Aplicar **SOLID, DRY, KISS y YAGNI** en todo momento: al crear componentes (incluidos los de shadcn), hooks, services y funciones en general.

- **SOLID**: cada componente/hook/service tiene una sola responsabilidad; depender de abstracciones (props, interfaces) y no de implementaciones concretas.
- **DRY**: no duplicar lógica ni markup; extraer a un hook, service o componente compartido cuando se repite.
- **KISS**: la solución más simple que resuelve el problema; sin abstracciones ni configuración que no se necesita hoy.
- **YAGNI**: no construir para casos futuros hipotéticos; agregar cuando el requisito exista realmente.

### Reglas de reutilización (obligatorias antes de crear algo nuevo)

1. **Componentes UI**: antes de crear un componente, verificar si ya existe en shadcn (`npx shadcn@latest add <component>`). Si shadcn no lo tiene, se crea manualmente pensando en que sea reutilizable (props genéricas, sin lógica de un solo caso de uso) y se ubica en `src/components/ui`.
2. **Cualquier componente, hook, función o service**: antes de crear uno nuevo, verificar si ya existe uno equivalente en el proyecto (buscar en `src/modules/*` y `src/components`, `src/lib`, `src/hooks`). Si existe, reutilizar o extender; no duplicar.

## 3. Metodología de trabajo: SDD (Spec Driven Development)

El flujo de trabajo se organiza en 4 agentes:

1. **Orquestador**: coordina el flujo completo, asigna el trabajo a los demás agentes en orden y valida que cada etapa se complete antes de pasar a la siguiente.
2. **Spec**: convierte el requerimiento en una especificación clara (qué se construye, alcance, criterios de aceptación) antes de escribir código.
3. **Developer**: implementa la especificación siguiendo la estructura de carpetas y las buenas prácticas de este documento.
4. **Reviewer**: revisa la implementación contra la spec y contra SOLID/DRY/KISS/YAGNI, y valida que el testing requerido esté cubierto.

Los agentes están definidos en `.claude/agents/` y las specs viven en `docs/specs/<slug>.md`.

### Aprobación humana (bloqueante)

Ninguna spec pasa a desarrollo sin aprobación de un humano. Toda spec nace con `Estado: borrador` y solo cambia a `Estado: aprobada` cuando un humano la aprueba explícitamente. Mientras no esté aprobada, el agente developer no puede iniciar (lo bloquea un hook del proyecto).

### Unit testing

- Framework: **Vitest**.
- Se agregan pruebas unitarias en las secciones que lo requieran: lógica de negocio (`services`, `hooks`, `store`, `schema`) y utilidades compartidas (`src/lib`). No es obligatorio para componentes puramente visuales sin lógica.
- El archivo de test vive junto al archivo que prueba, con sufijo `.test.ts` (o `.test.tsx` si prueba un componente): `user-service.ts` → `user-service.test.ts`.
