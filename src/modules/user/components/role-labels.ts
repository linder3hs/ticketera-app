import type { OrganizerStatus, Role } from "@/modules/user/user.types";

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  organizer: "Organizador",
  customer: "Cliente",
};

export const ORGANIZER_STATUS_LABEL: Record<OrganizerStatus, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  suspended: "Suspendido",
};
