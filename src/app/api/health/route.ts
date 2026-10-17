// Liveness probe for the deploy script and smoke test. No auth, no DB.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" });
}
