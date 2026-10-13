/** `YYYY-MM-DD` / `HH:mm` of every venue are read in Lima (UTC-5, no DST). ponytail: store a timezone per venue when that stops holding. */
const LIMA_OFFSET = "-05:00";

/** `"19.99"` → `1999`. Integer maths on the digits, so no float rounding. `null` unless it is digits with up to 2 decimals. */
export function parsePriceToCents(price: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price.trim());
  if (!match) return null;
  const [, whole, decimals = ""] = match;
  return Number(whole) * 100 + Number(decimals.padEnd(2, "0"));
}

/** `1999` → `"19.99"`, `12000` → `"120"`: integer maths, and it round-trips through `parsePriceToCents`. */
export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100);
  const decimals = cents % 100;
  return decimals === 0 ? String(whole) : `${whole}.${String(decimals).padStart(2, "0")}`;
}

/** Minute precision: the form only carries `HH:mm`, so stored seconds must not count as a change. */
export const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / 60_000) === Math.floor(b.getTime() / 60_000);

/** The instant of a Lima date (`YYYY-MM-DD`) and time (`HH:mm`). Callers validate the format first (the schema does); it does not catch every malformed input. */
export function toStartsAt(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${LIMA_OFFSET}`);
}

/** `base` if free, otherwise the first free `base-2`, `base-3`… (an empty base falls back to `event`). */
export function nextAvailableSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = base || "event";
  if (!used.has(root)) return root;
  let suffix = 2;
  while (used.has(`${root}-${suffix}`)) suffix += 1;
  return `${root}-${suffix}`;
}
