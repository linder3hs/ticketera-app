/** Postgres error code of a driver error, looking through wrappers (`cause`). */
export function pgErrorCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 5; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string") return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
