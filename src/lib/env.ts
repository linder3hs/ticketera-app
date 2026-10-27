/** The value of `name`, or a clear error when it is missing (no defaults in code). */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Public base URL of the app; outside production it falls back to the local dev server. */
export function getAppUrl(): string {
  const url = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!url) throw new Error("APP_URL is not set.");
  return url;
}
