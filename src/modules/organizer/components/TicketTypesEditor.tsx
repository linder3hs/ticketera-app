import { Input } from "@/components/ui/input";
import type { EventZoneFormValues, VenueZoneOption } from "@/modules/event/event-write.types";

interface TicketTypesEditorProps {
  /** Zones of the chosen venue: one fixed row each. */
  venueZones: VenueZoneOption[];
  /** One entry per `venueZones` item, in the same order. */
  value: EventZoneFormValues[];
  /** Errors keyed "zones.<index>.<field>". */
  errors: Record<string, string>;
  /** Sold or held per venue zone id; those zones keep their price and cannot drop below it. */
  occupied?: Record<string, number>;
  disabled?: boolean;
  onChange: (value: EventZoneFormValues[]) => void;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const COLUMNS = "sm:grid-cols-[minmax(0,1fr)_130px_130px]";

const number = new Intl.NumberFormat("es-PE");

export const zoneFieldId = (index: number, field: "price" | "capacity") => `zones-${index}-${field}`;

/** Seats on sale of a zone row: GA = the typed capacity, numbered = all its seats. */
function zoneCapacity(zone: VenueZoneOption, row: EventZoneFormValues): number {
  if (row.price.trim() === "") return 0;
  if (zone.seatingType === "numbered") return zone.capacity;
  const capacity = Number(row.capacity);
  return Number.isInteger(capacity) && capacity > 0 ? capacity : 0;
}

/**
 * Zone editor of the chosen venue: a fixed row per venue zone with its price and,
 * for general-admission zones, its capacity. An empty price means "not for sale".
 */
export function TicketTypesEditor({ venueZones, value, errors, occupied = {}, disabled = false, onChange }: TicketTypesEditorProps) {
  function update(index: number, field: "price" | "capacity", text: string) {
    onChange(value.map((row, i) => (i === index ? { ...row, [field]: text } : row)));
  }

  if (venueZones.length === 0) {
    return <p className="text-sm text-muted-foreground">Elige un recinto para configurar sus zonas.</p>;
  }

  const total = venueZones.reduce((sum, zone, index) => sum + (value[index] ? zoneCapacity(zone, value[index]) : 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className={`hidden gap-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:grid ${COLUMNS}`}>
        <span>Zona</span>
        <span>Precio (S/)</span>
        <span>Capacidad</span>
      </div>

      <ul className="flex flex-col gap-3">
        {venueZones.map((zone, index) => {
          const row = value[index];
          if (!row) return null;
          const isGeneral = zone.seatingType === "general_admission";
          const taken = occupied[zone.id] ?? 0;
          const priceLocked = taken > 0;
          const priceError = errors[`zones.${index}.price`];
          const capacityError = errors[`zones.${index}.capacity`];
          const rowErrors = [priceError, capacityError].filter(Boolean);
          const errorsId = `zones-${index}-errors`;
          const lockedId = `zones-${index}-locked`;
          const priceId = zoneFieldId(index, "price");
          const capacityId = zoneFieldId(index, "capacity");

          return (
            <li key={zone.id} className="flex flex-col gap-1.5 rounded-2xl border border-border p-3 sm:border-0 sm:p-0">
              <div className={`grid grid-cols-2 gap-2.5 sm:items-center sm:gap-3 ${COLUMNS}`}>
                <div className="col-span-2 flex min-w-0 flex-col sm:col-span-1">
                  <span className="truncate text-[15px] font-semibold">{zone.name}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {isGeneral ? `De pie · hasta ${number.format(zone.capacity)}` : `Numerada · ${number.format(zone.capacity)} asientos`}
                    {row.price.trim() === "" && " · no se vende"}
                  </span>
                </div>

                <div>
                  <label htmlFor={priceId} className="mb-1.5 block text-xs font-medium text-muted-foreground sm:sr-only">
                    Precio (S/) de {zone.name}
                  </label>
                  <Input
                    id={priceId}
                    inputMode="decimal"
                    placeholder="Sin precio"
                    disabled={disabled || priceLocked}
                    aria-invalid={priceError ? true : undefined}
                    aria-describedby={[priceError ? errorsId : null, priceLocked ? lockedId : null].filter(Boolean).join(" ") || undefined}
                    value={row.price}
                    onChange={(event) => update(index, "price", event.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>

                <div>
                  <label htmlFor={capacityId} className="mb-1.5 block text-xs font-medium text-muted-foreground sm:sr-only">
                    Capacidad de {zone.name}
                  </label>
                  {isGeneral ? (
                    <Input
                      id={capacityId}
                      inputMode="numeric"
                      placeholder={String(zone.capacity)}
                      disabled={disabled}
                      aria-invalid={capacityError ? true : undefined}
                      aria-describedby={capacityError ? errorsId : undefined}
                      value={row.capacity}
                      onChange={(event) => update(index, "capacity", event.target.value)}
                      className={FIELD_CLASS}
                    />
                  ) : (
                    <p
                      id={capacityId}
                      className="flex h-[52px] items-center rounded-[14px] border border-zinc-200 bg-muted px-4 text-[15px] text-muted-foreground tabular-nums"
                    >
                      {number.format(zone.capacity)}
                    </p>
                  )}
                </div>
              </div>

              {priceLocked && (
                <p id={lockedId} className="text-[13px] text-muted-foreground">
                  Tiene {number.format(taken)} entradas vendidas o reservadas: el precio no se puede cambiar ni la zona quitar
                  {isGeneral ? `, y la capacidad no puede bajar de ${number.format(taken)}` : ""}.
                </p>
              )}
              {rowErrors.length > 0 && (
                <p id={errorsId} className="text-[13px] font-medium text-destructive">
                  {rowErrors.join(" ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <p className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm">
        <span className="text-muted-foreground">Capacidad total a la venta</span>
        <strong className="font-semibold tabular-nums">{number.format(total)} entradas</strong>
      </p>
    </div>
  );
}
