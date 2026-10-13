/** Sales of one event zone, as read from the inventory. */
export interface ZoneSales {
  eventId: string;
  priceCents: number;
  sold: number;
  capacity: number;
}

export interface EventSales {
  sold: number;
  capacity: number;
  revenueCents: number;
}

/** Adds up zone rows per event: revenue = tickets sold × the zone's price. */
export function aggregateZoneSales(zones: ZoneSales[]): Map<string, EventSales> {
  const byEvent = new Map<string, EventSales>();
  for (const zone of zones) {
    const total = byEvent.get(zone.eventId) ?? { sold: 0, capacity: 0, revenueCents: 0 };
    total.sold += zone.sold;
    total.capacity += zone.capacity;
    total.revenueCents += zone.sold * zone.priceCents;
    byEvent.set(zone.eventId, total);
  }
  return byEvent;
}

/** Calendar day (`YYYY-MM-DD`) of an instant in Lima. ponytail: every venue is in Lima's timezone today; store a timezone per venue when that stops holding. */
export function toLimaDate(instant: Date): string {
  return instant.toLocaleDateString("en-CA", { timeZone: "America/Lima" });
}

/** `HH:mm` of an instant in Lima (the counterpart of `toLimaDate`). `h23` avoids `24:00` at midnight. */
export function toLimaTime(instant: Date): string {
  return instant.toLocaleTimeString("en-GB", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
}
