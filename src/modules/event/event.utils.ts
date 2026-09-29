/**
 * Formats an event's starting price into a localized currency string.
 */
export function formatEventPrice(priceFrom: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceFrom);
}

// The mock dates are plain "YYYY-MM-DD" strings, parsed as UTC midnight by
// `Date`. Formatting in UTC avoids an off-by-one day in timezones behind UTC
// (e.g. Lima, UTC-5). ICU capitalizes standalone month names ("Dic"), so
// every part is lowercased.
function formatPart(isoDate: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("es-PE", { ...options, timeZone: "UTC" })
    .format(new Date(isoDate))
    .replace(".", "")
    .toLowerCase();
}

/**
 * Splits an event's ISO date into the pieces the UI shows: the date chip
 * (`day` "05", `month` "OCT"), a compact label ("lun 5 oct") and a long one
 * ("lunes 5 de octubre").
 */
export function formatEventDateParts(isoDate: string) {
  const day = formatPart(isoDate, { day: "numeric" });
  const month = formatPart(isoDate, { month: "short" });

  return {
    day: day.padStart(2, "0"),
    month: month.toUpperCase(),
    short: `${formatPart(isoDate, { weekday: "short" })} ${day} ${month}`,
    long: `${formatPart(isoDate, { weekday: "long" })} ${day} de ${formatPart(isoDate, { month: "long" })}`,
  };
}
