import { describe, expect, it } from "vitest";
import { getVenueMap } from "@/modules/booking/services/venue-service";

describe("venue-service", () => {
  describe("getVenueMap", () => {
    it("returns the five zones of the stadium", async () => {
      const venue = await getVenueMap("evt-001");
      expect(venue?.zones.map((zone) => zone.id)).toEqual([
        "vip",
        "general",
        "occidente",
        "oriente",
        "norte",
      ]);
    });

    it("prices zones from the event's starting price and currency", async () => {
      const venue = await getVenueMap("evt-001");
      const prices = Object.fromEntries(venue!.zones.map((zone) => [zone.id, zone.price]));
      expect(prices).toEqual({ vip: 690, general: 450, occidente: 380, oriente: 320, norte: 250 });
      expect(venue!.zones.every((zone) => zone.currency === "PEN")).toBe(true);
    });

    it("gives seats only to the numbered stands", async () => {
      const venue = await getVenueMap("evt-001");
      for (const zone of venue!.zones) {
        if (zone.kind === "seated") {
          expect(zone.rows!.length).toBeGreaterThan(0);
          expect(zone.rows!.every((row) => row.seats.length > 0)).toBe(true);
        } else {
          expect(zone.rows).toBeUndefined();
        }
      }
    });

    it("uses unique seat ids", async () => {
      const venue = await getVenueMap("evt-001");
      const ids = venue!.zones.flatMap((zone) =>
        (zone.rows ?? []).flatMap((row) => row.seats.map((seat) => seat.id)),
      );
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("is deterministic: the same event always has the same occupied seats", async () => {
      const occupied = async (eventId: string) =>
        (await getVenueMap(eventId))!.zones.flatMap((zone) =>
          (zone.rows ?? []).flatMap((row) =>
            row.seats.filter((seat) => seat.status === "occupied").map((seat) => seat.id),
          ),
        );

      const first = await occupied("evt-001");
      expect(first.length).toBeGreaterThan(0);
      expect(await occupied("evt-001")).toEqual(first);
      expect(await occupied("evt-002")).not.toEqual(first);
    });

    it("sells out every zone of a sold-out event", async () => {
      const venue = await getVenueMap("evt-003");
      expect(venue!.zones.every((zone) => zone.status === "sold-out")).toBe(true);
    });

    it("gives every zone an outline for the venue overview", async () => {
      const venue = await getVenueMap("evt-001");
      expect(venue!.viewBox).toMatch(/^0 0 \d+ \d+$/);
      for (const zone of venue!.zones) {
        expect(zone.shape.path).toMatch(/^M.*Z$/);
        expect(zone.shape.labelX).toBeGreaterThan(0);
        expect(zone.shape.labelY).toBeGreaterThan(0);
      }
    });

    it("returns undefined for an unknown event", async () => {
      expect(await getVenueMap("not-an-event")).toBeUndefined();
    });
  });
});
