# Gestión de usuarios: lista con filtros, paginación y CRUD

Estado: aprobada

## Objetivo

Reemplazar la vista `/admin/users` (tabla sin filtros, formulario de invitación en línea) por el diseño "Gestión de usuarios" (https://claude.ai/artifact/NXYfXaQZi1uRwG6U9DvuB5): lista con búsqueda, filtros y paginación del lado del servidor, y CRUD completo (invitar, ver, editar, eliminar) con diálogos. Escritorio en tabla, móvil en tarjetas.

Roles, permisos y sincronización con Clerk: `system-design.md §3` y §5.5; flujo en `docs/auth-roles.md`; reglas en `src/modules/user/user.permissions.ts`.

## Alcance

- Incluye:
  - **Lista**: columnas Usuario (nombre, correo), Rol, Organizador (estado), Registro; más reciente primero. Solo usuarios no eliminados (`deletedAt is null`).
  - **Filtros y paginación en la URL** (`/admin/users?q=&role=&status=&page=&pageSize=`), resueltos en el servidor: búsqueda por nombre o correo (insensible a mayúsculas), rol, estado de organizador, filas por página 8/16/24 (default 8). Cambiar un filtro vuelve a la página 1. Botón "Limpiar" y estado vacío "Sin resultados". Rango "Mostrando X–Y de N" y botones anterior/siguiente + números (ventana de 5).
  - **Crear**: diálogo "Invitar usuario" (correo + rol) sobre la acción existente `inviteStaffAction`; reemplaza el formulario en línea.
  - **Editar**: diálogo con rol y estado de organizador (Aprobado/Suspendido). Nombre y correo se muestran de solo lectura (vienen de Clerk).
  - **Eliminar**: diálogo de confirmación; borrado lógico + baja de la cuenta en Clerk.
  - **Aprobar/suspender** rápido en la fila de organizadores (acción existente).
  - Filas bloqueadas con candado y motivo ("Tu cuenta", "Cuenta protegida", "Solo el super admin") según `canManageUser`.
  - Aviso de resultado tras cada acción (`role="status"`), errores del servidor visibles.
  - Móvil (`<md`): tarjetas con las mismas acciones.
- No incluye:
  - Edición de nombre/correo (ver Preguntas abiertas), ordenamiento por columna, selección múltiple/acciones masivas, exportación, vista de detalle propia.
  - Cambios en `proxy.ts`, en el shell del panel ni en el webhook de Clerk.

## Reutilizar

- `listUsers` (se generaliza), `findUserById`, `softDeleteUser`, `setOrganizerStatus`, `setUserRole` en `user-service.ts`; `changeUserRole`, `changeOrganizerStatus`, `inviteStaff` en `staff-service.ts`; `syncRoleToClerk`/`inviteToClerk` en `clerk-service.ts`.
- `canAssignRole`, `ASSIGNABLE_ROLES`, `can` de `user.permissions.ts`; `ROLE_LABEL`, `ORGANIZER_STATUS_LABEL` de `role-labels.ts`; `requireRole`, `ActionResult`.
- shadcn ya instalado: `table`, `select`, `input`, `badge`, `button`, `form-field`. Falta `dialog`, `alert-dialog`, `pagination` (T0).
- Patrón `searchParams` async de `src/app/(platform)/events/page.tsx` (Next 16, `PageProps`).
- `InviteStaffForm.tsx` (se convierte en diálogo, no se duplica).

## Archivos

Nuevos / modificados:
- `src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `pagination.tsx` (shadcn)
- `src/lib/utils.ts` + `utils.test.ts` (`escapeLike`)
- `src/modules/user/user.permissions.ts` + test (`canManageUser`)
- `src/modules/user/user.schema.ts` + test (`usersQuerySchema`, `updateUserSchema`, `deleteUserSchema`)
- `src/modules/user/user.types.ts` (tipos de la consulta y de la fila)
- `src/modules/user/services/user-service.ts` (`listUsersPage`), `staff-service.ts` (`updateUser`, `deleteUser`), `clerk-service.ts` (`deleteClerkUser`)
- `src/modules/user/actions.ts` (`updateUserAction`, `deleteUserAction`)
- `src/modules/user/hooks/use-users-query.ts` (lee y escribe los parámetros de la URL)
- `src/modules/user/components/`: `UsersAdmin.tsx` (reescrito), `UsersFilters.tsx`, `UsersTable.tsx`, `UsersPagination.tsx`, `InviteStaffDialog.tsx` (reemplaza `InviteStaffForm.tsx`), `EditUserDialog.tsx`, `DeleteUserDialog.tsx`
- `src/app/(admin)/admin/users/page.tsx`

## Criterios de aceptación

- AC1: `/admin/users` lista 8 usuarios por defecto, más recientes primero, con total correcto; `pageSize` acepta solo 8/16/24 (otro valor cae al default).
- AC2: `q` filtra por nombre o correo sin distinguir mayúsculas y trata `%` y `_` como texto literal; `role` y `status` filtran (`status` solo coincide con organizadores); los filtros se combinan.
- AC3: el estado vive en la URL: recargar o compartir el enlace reproduce la vista; cambiar un filtro o `pageSize` vuelve a `page=1`; una página fuera de rango se ajusta a la última.
- AC4: la búsqueda se aplica con retardo (~300 ms) sin perder el foco del input; "Limpiar" restablece todo; sin resultados se muestra el estado vacío.
- AC5: invitar funciona como hoy (usuario existente → cambia rol; nuevo → invitación Clerk); un admin solo puede invitar organizadores, el super admin también admins.
- AC6: editar cambia rol y/o estado de organizador y los refleja en DB y en Clerk (`publicMetadata.role`); las opciones de rol respetan `canAssignRole`; el estado solo aparece si el rol es organizador.
- AC7: eliminar marca `deletedAt`, borra la cuenta en Clerk, deja al usuario como `customer` y suspende su perfil de organizador (para que un re-registro no recupere el rol anterior); el usuario desaparece de la lista; sus compras y eventos se conservan.
- AC8: `canManageUser(actor, target)` es falso para uno mismo, para `super_admin` y para admins cuando el actor no es super admin; esas filas muestran candado y motivo, y los servicios lo rechazan aunque se llame la acción directamente.
- AC9: toda acción valida entrada con zod, exige `requireRole('admin')`, devuelve `ActionResult` y refresca la lista; los errores se muestran sin cerrar el diálogo.
- AC10: accesibilidad: diálogos con título, foco atrapado y cierre con Esc; botones de icono con `aria-label` que incluye al usuario; targets ≥44 px; paginación con `aria-current="page"`.
- AC11: móvil: tarjetas con rol, estado, fecha y acciones; sin scroll horizontal de página.
- AC12: `npm run lint`, `npx vitest run` y `npm run build` pasan.

## Tests requeridos

- `utils.test.ts`: `escapeLike` (AC2).
- `user.permissions.test.ts`: `canManageUser` para cada combinación de rol de actor/objetivo y uno mismo (AC8).
- `user.schema.test.ts`: `usersQuerySchema` (defaults, `pageSize` inválido, página no numérica, trim de `q`, valores de rol/estado fuera de enum caen a "todos") y `updateUserSchema`/`deleteUserSchema` (AC1, AC3, AC9).
- Servicios con DB y componentes visuales sin test (precedente del repo, SETUP.md §3).

## Tareas

### T0 — Componentes shadcn
- Archivos: `src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `pagination.tsx` (`npx shadcn@latest add dialog alert-dialog pagination`)
- Depende de: —
- Paralelizable: sí
- Cubre: base de AC10

### T1 — Datos, permisos y acciones
- Archivos: `src/lib/utils.ts`, `src/lib/utils.test.ts`, `user.permissions.ts` y test, `user.schema.ts` y test, `user.types.ts`, `services/user-service.ts`, `services/staff-service.ts`, `services/clerk-service.ts`, `actions.ts`
- Depende de: —
- Paralelizable: sí
- Cubre: AC1, AC2, AC3, AC5, AC6, AC7, AC8, AC9

### T2 — Lista: filtros, tabla/tarjetas y paginación
- Archivos: `hooks/use-users-query.ts`, `components/UsersFilters.tsx`, `UsersTable.tsx`, `UsersPagination.tsx`
- Depende de: T0, T1 (tipos y esquema de consulta)
- Paralelizable: sí con T3
- Cubre: AC3, AC4, AC8 (candado), AC10, AC11

### T3 — Diálogos de CRUD
- Archivos: `components/InviteStaffDialog.tsx` (reemplaza `InviteStaffForm.tsx`, que se elimina), `EditUserDialog.tsx`, `DeleteUserDialog.tsx`
- Depende de: T0, T1 (acciones)
- Paralelizable: sí con T2
- Cubre: AC5, AC6, AC7, AC9, AC10

### T4 — Composición y ruta
- Archivos: `components/UsersAdmin.tsx`, `src/app/(admin)/admin/users/page.tsx`
- Depende de: T2, T3
- Paralelizable: no
- Cubre: AC1, AC12 (integración)

## Preguntas abiertas

1. **Nombre editable**: el diseño lo mostraba editable, pero `fullName` es un campo espejo de Clerk y el próximo sync lo sobrescribiría. Por defecto queda de solo lectura. Si lo quieres editable, hay que actualizarlo también en Clerk (`users.updateUser`) y dividir nombre/apellido: más alcance.
2. **Eliminar**: por defecto borrado lógico + eliminar la cuenta en Clerk (la persona tendría que registrarse de nuevo). ¿O prefieres solo desactivar el acceso sin borrar en Clerk?
3. **Estado "Pendiente"** en el diálogo de editar: por defecto el selector ofrece solo Aprobado/Suspendido (como el esquema actual); pendiente se muestra solo como badge y se resuelve con "Aprobar".
4. **Orden**: hoy la lista va del más antiguo al más reciente; el diseño la invierte (más reciente primero).
5. **Cuenta propia**: el super admin tampoco se puede editar ni eliminar desde la app (consistente con `canAssignRole`).

## Próximas fases

- Edición de nombre con sincronización a Clerk, orden por columna, acciones masivas, exportar CSV, auditoría de cambios de rol.
