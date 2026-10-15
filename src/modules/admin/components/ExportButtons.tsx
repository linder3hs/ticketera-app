"use client";

import { useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AdminMetrics } from "@/modules/admin/admin-metrics.types";
import { downloadDashboardPdf, downloadDashboardXlsx } from "@/modules/admin/admin-export";

interface ExportButtonsProps {
  metrics: AdminMetrics;
}

type ExportFormat = "pdf" | "xlsx";

const EXPORTS = [
  { format: "pdf", label: "Exportar PDF", icon: FileText, download: downloadDashboardPdf },
  { format: "xlsx", label: "Exportar Excel", icon: FileSpreadsheet, download: downloadDashboardXlsx },
] as const;

/** Downloads the dashboard metrics it receives as a PDF or an Excel file. */
export function ExportButtons({ metrics }: ExportButtonsProps) {
  const [pending, setPending] = useState<ExportFormat | null>(null);
  const [failed, setFailed] = useState(false);

  async function handleExport(format: ExportFormat, download: (metrics: AdminMetrics) => Promise<void>) {
    setPending(format);
    setFailed(false);
    try {
      await download(metrics);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map(({ format, label, icon: Icon, download }) => (
          <Button
            key={format}
            type="button"
            variant="outline"
            className="h-11 cursor-pointer gap-2 rounded-xl px-4"
            disabled={pending !== null}
            onClick={() => handleExport(format, download)}
          >
            <Icon className="size-4" aria-hidden="true" />
            {pending === format ? "Generando…" : label}
          </Button>
        ))}
      </div>
      {failed && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          No se pudo generar el archivo. Intenta de nuevo.
        </p>
      )}
    </div>
  );
}
