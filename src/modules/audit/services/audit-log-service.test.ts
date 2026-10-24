import { beforeEach, describe, expect, it, vi } from "vitest";

import { insertAuditLog } from "@/modules/audit/services/audit-log-data-service";
import { recordAudit } from "@/modules/audit/services/audit-log-service";
import { getCurrentUser, getImpersonation } from "@/modules/user/current-user";
import type { UserRecord } from "@/modules/user/services/user-service";
import type { Role } from "@/modules/user/user.types";

// Explicit factories: neither the real session (Clerk, `next/*`) nor `@/db` is loaded.
vi.mock("@/modules/user/current-user", () => ({ getImpersonation: vi.fn(), getCurrentUser: vi.fn() }));
vi.mock("@/modules/audit/services/audit-log-data-service", () => ({ insertAuditLog: vi.fn() }));

const userOf = (id: string, role: Role): UserRecord => ({
  id,
  clerkId: `clerk_${id}`,
  email: `${id}@example.com`,
  fullName: null,
  avatarUrl: null,
  authProvider: "google",
  phone: null,
  documentType: null,
  documentNumber: null,
  role,
  deletedAt: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
});

const superAdmin = userOf("super-admin-1", "super_admin");
const organizer = userOf("organizer-1", "organizer");

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(getImpersonation).mockResolvedValue(null);
  vi.mocked(insertAuditLog).mockResolvedValue(undefined);
});

describe("recordAudit", () => {
  it("records the super admin acting as themselves, with no on-behalf-of user", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin);

    await recordAudit({ action: "user.change_role", targetType: "user", targetId: "user-9", metadata: { role: "admin" } });

    expect(insertAuditLog).toHaveBeenCalledExactlyOnceWith({
      actorUserId: superAdmin.id,
      onBehalfOfUserId: null,
      action: "user.change_role",
      targetType: "user",
      targetId: "user-9",
      metadata: { role: "admin" },
    });
  });

  it("stores the optional fields as null when the entry leaves them out", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin);

    await recordAudit({ action: "payment.update_platform_fee" });

    expect(insertAuditLog).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ targetType: null, targetId: null, metadata: null }),
    );
  });

  it("attributes an impersonated action to the real super admin, on behalf of the target (AC9)", async () => {
    vi.mocked(getImpersonation).mockResolvedValue({ real: superAdmin, target: organizer });
    // The effective user while impersonating is the target; it must never be the actor.
    vi.mocked(getCurrentUser).mockResolvedValue(organizer);

    await recordAudit({ action: "payment.start_connect_onboarding" });

    expect(insertAuditLog).toHaveBeenCalledExactlyOnceWith({
      actorUserId: superAdmin.id,
      onBehalfOfUserId: organizer.id,
      action: "payment.start_connect_onboarding",
      targetType: null,
      targetId: null,
      metadata: null,
    });
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it.each<Role>(["admin", "organizer", "customer"])("does nothing for a %s (AC10)", async (role) => {
    vi.mocked(getCurrentUser).mockResolvedValue(userOf(`${role}-1`, role));

    await recordAudit({ action: "event.update", targetType: "event", targetId: "event-1" });

    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is signed in (AC10)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    await recordAudit({ action: "favorite.set", targetType: "event", targetId: "event-1" });

    expect(insertAuditLog).not.toHaveBeenCalled();
  });

  it("never throws when the insert fails, and logs the error (AC12)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(superAdmin);
    vi.mocked(insertAuditLog).mockRejectedValue(new Error("insert rejected"));

    await expect(recordAudit({ action: "event.delete", targetType: "event", targetId: "event-1" })).resolves.toBeUndefined();

    expect(console.error).toHaveBeenCalledOnce();
  });

  it("never throws when the actor cannot be resolved", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error("session unavailable"));

    await expect(recordAudit({ action: "venue.create", targetType: "venue" })).resolves.toBeUndefined();

    expect(insertAuditLog).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
