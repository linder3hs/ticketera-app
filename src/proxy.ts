import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { hasRole, isRole } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

const isProtected = createRouteMatcher(["/admin(.*)", "/organizer(.*)", "/my-tickets(.*)", "/favorites(.*)"]);
const MIN_ROLE_BY_AREA: [RegExp, Role][] = [
  [/^\/admin(\/|$)/, "admin"],
  [/^\/organizer(\/|$)/, "organizer"],
];

export default clerkMiddleware(async (auth, req) => {
  if (!isProtected(req)) return;

  const { sessionClaims } = await auth.protect();

  // Coarse role check from Clerk's publicMetadata (needs the `metadata` session claim, see docs/auth-roles.md).
  // The DB stays the source of truth: layouts and server actions re-check it with `requireRole`.
  const role = (sessionClaims?.metadata as { role?: unknown } | undefined)?.role;
  const minRole = MIN_ROLE_BY_AREA.find(([area]) => area.test(req.nextUrl.pathname))?.[1];
  if (minRole && isRole(role) && !hasRole(role, minRole)) {
    return NextResponse.redirect(new URL("/", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
