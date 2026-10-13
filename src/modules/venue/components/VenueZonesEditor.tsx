"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Lock, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteZoneAction } from "@/modules/venue/actions";
import { ConfirmDeleteDialog } from "@/modules/venue/components/ConfirmDeleteDialog";
import { SeatGeneratorForm } from "@/modules/venue/components/SeatGeneratorForm";
import { ZoneForm } from "@/modules/venue/components/ZoneForm";
import { ZoneMapPreview } from "@/modules/venue/components/ZoneMapPreview";
import { VENUE_MESSAGES } from "@/modules/venue/venue.policy";
import type { VenueCapabilities, ZoneForEdit } from "@/modules/venue/venue.types";

interface VenueZonesEditorProps {
  venueId: string;
  zones: ZoneForEdit[];
  capabilities: VenueCapabilities;
  /** Why the zones are read-only; shown when `capabilities.editZones` is false. */
  lockedReason?: string;
}

/** What is open: a dialog for a form, or the delete confirmation. */
type Panel = { kind: "create" } | { kind: "edit" | "seats" | "delete"; zone: ZoneForEdit };

const number = new Intl.NumberFormat("es-PE");
const ACTION_CLASS = "h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold";

function describeZone(zone: ZoneForEdit): string {
  if (zone.seatingType === "numbered") {
    return `Numerada · ${number.format(zone.seatCount)} ${zone.seatCount === 1 ? "asiento" : "asientos"}`;
  }
  return `Entrada general · capacidad ${number.format(zone.capacity ?? 0)}`;
}

function describeShape(zone: ZoneForEdit): string {
  if (!zone.shape) return "Sin forma en el mapa";
  if (zone.shape.kind === "rectangle") return "Forma: rectángulo";
  if (zone.shape.kind === "ellipse") return "Forma: elipse";
  return "Forma personalizada";
}

interface ZoneItemProps {
  zone: ZoneForEdit;
  editable: boolean;
  onOpen: (panel: Panel) => void;
}

function ZoneItem({ zone, editable, onOpen }: ZoneItemProps) {
  const canGenerate = editable && zone.seatingType === "numbered" && zone.capabilities.generateSeats;
  const canDelete = editable && zone.capabilities.delete;
  const reason = editable && zone.isReferenced ? VENUE_MESSAGES.zone_in_use : undefined;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {/* The name is always next to the swatch: color is never the only signal. */}
        <span
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 rounded-md border border-black/10"
          style={{ backgroundColor: zone.color ?? undefined }}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold">{zone.name}</span>
            {zone.isReferenced && (
              <Badge variant="secondary" className="h-6 px-2.5">
                En uso por un evento
              </Badge>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {describeZone(zone)} · {describeShape(zone)}
          </p>
          {reason && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5 shrink-0" aria-hidden="true" />
              {reason}
            </p>
          )}
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Button type="button" variant="outline" aria-label={`Editar ${zone.name}`} onClick={() => onOpen({ kind: "edit", zone })} className={ACTION_CLASS}>
            Editar
          </Button>
          {canGenerate && (
            <Button
              type="button"
              variant="outline"
              aria-label={`Generar asientos de ${zone.name}`}
              onClick={() => onOpen({ kind: "seats", zone })}
              className={ACTION_CLASS}
            >
              {zone.seatCount > 0 ? "Regenerar asientos" : "Generar asientos"}
            </Button>
          )}
          {canDelete && (
            <Button
              type="button"
              variant="destructive"
              aria-label={`Eliminar ${zone.name}`}
              onClick={() => onOpen({ kind: "delete", zone })}
              className={ACTION_CLASS}
            >
              Eliminar
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Zones of a venue: map preview, list with create / edit / delete and the seat
 * generator. Read-only (with the reason) when `capabilities.editZones` is false.
 * After every successful change it refreshes the page data.
 */
export function VenueZonesEditor({ venueId, zones, capabilities, lockedReason }: VenueZonesEditorProps) {
  const router = useRouter();
  // The last panel stays while its dialog closes, so the text does not vanish mid-animation.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const editable = capabilities.editZones;

  function show(next: Panel) {
    setPanel(next);
    setOpen(true);
  }

  function done(message: string) {
    setOpen(false);
    setNotice(message);
    router.refresh();
  }

  const formPanel = panel && panel.kind !== "delete" ? panel : null;
  const deletePanel = panel?.kind === "delete" ? panel : null;

  return (
    <section
      aria-labelledby="venue-zones-title"
      className="flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="venue-zones-title" className="text-lg font-semibold lg:text-xl">
            Zonas y asientos
          </h2>
          <p className="text-[13px] text-muted-foreground lg:text-sm">
            Cada zona es de entrada general o numerada, y puede dibujarse en el mapa del recinto.
          </p>
        </div>
        {editable && (
          <Button type="button" onClick={() => show({ kind: "create" })} className="h-11 cursor-pointer gap-2 rounded-xl px-5 text-sm font-semibold">
            <Plus className="size-[18px]" aria-hidden="true" />
            Agregar zona
          </Button>
        )}
      </div>

      {!editable && lockedReason && (
        <p
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          <Lock className="size-5 shrink-0" aria-hidden="true" />
          {lockedReason}
        </p>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
        >
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{notice}</p>
          <Button variant="ghost" size="icon" aria-label="Cerrar aviso" className="size-11" onClick={() => setNotice(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      <ZoneMapPreview zones={zones} />

      {zones.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
          <p className="text-base font-semibold">Este recinto todavía no tiene zonas</p>
          {editable && <p className="mt-1 text-sm text-muted-foreground">Agrega la primera para poder usarlo en un evento.</p>}
        </div>
      ) : (
        <ul aria-label="Zonas del recinto" className="flex flex-col gap-3">
          {zones.map((zone) => (
            <ZoneItem key={zone.id} zone={zone} editable={editable} onOpen={show} />
          ))}
        </ul>
      )}

      <Dialog open={open && formPanel !== null} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent showCloseButton={false} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {formPanel && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold">
                  {formPanel.kind === "create" && "Agregar zona"}
                  {formPanel.kind === "edit" && `Editar zona “${formPanel.zone.name}”`}
                  {formPanel.kind === "seats" && `Generar asientos de “${formPanel.zone.name}”`}
                </DialogTitle>
                {formPanel.kind === "seats" && (
                  <DialogDescription>Se crea una grilla recta de filas con letras y asientos numerados.</DialogDescription>
                )}
              </DialogHeader>
              {formPanel.kind === "seats" ? (
                <SeatGeneratorForm
                  key={formPanel.zone.id}
                  zone={formPanel.zone}
                  onCancel={() => setOpen(false)}
                  onDone={(count) => done(`Generamos ${number.format(count)} ${count === 1 ? "asiento" : "asientos"} en “${formPanel.zone.name}”.`)}
                />
              ) : (
                <ZoneForm
                  key={formPanel.kind === "edit" ? formPanel.zone.id : "new"}
                  venueId={venueId}
                  zone={formPanel.kind === "edit" ? formPanel.zone : undefined}
                  onCancel={() => setOpen(false)}
                  onDone={() => done(formPanel.kind === "edit" ? "Guardamos los cambios de la zona." : "Agregamos la zona.")}
                />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {deletePanel && (
        <ConfirmDeleteDialog
          open={open}
          title={`¿Eliminar la zona “${deletePanel.zone.name}”?`}
          description={
            deletePanel.zone.seatCount > 0
              ? `Se borrarán la zona y sus ${number.format(deletePanel.zone.seatCount)} asientos. Esta acción no se puede deshacer.`
              : "Esta acción no se puede deshacer."
          }
          confirmLabel="Eliminar zona"
          onClose={() => setOpen(false)}
          onConfirm={() => deleteZoneAction({ id: deletePanel.zone.id })}
          onSuccess={() => {
            setNotice(`Eliminamos la zona “${deletePanel.zone.name}”.`);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
