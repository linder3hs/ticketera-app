import { cn } from "@/lib/utils";
import type { PaymentMethod } from "@/modules/booking/booking.types";

const METHODS: { key: PaymentMethod; label: string; shortLabel: string }[] = [
  { key: "card", label: "Tarjeta de crédito o débito", shortLabel: "Tarjeta" },
  { key: "yape", label: "Yape", shortLabel: "Yape" },
  { key: "cash", label: "PagoEfectivo", shortLabel: "PagoEfectivo" },
];

interface PaymentMethodPickerProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
}

/** Radio cards for the payment method. */
export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  return (
    <fieldset className="grid gap-2.5 lg:grid-cols-3 lg:gap-3">
      <legend className="sr-only">Método de pago</legend>
      {METHODS.map((method) => {
        const isSelected = method.key === value;
        return (
          <label
            key={method.key}
            className={cn(
              "flex h-[60px] cursor-pointer items-center gap-3 rounded-[14px] border-2 px-4 text-[15px] font-semibold has-focus-visible:ring-3 has-focus-visible:ring-ring/50 lg:h-[76px] lg:rounded-2xl lg:px-[18px]",
              isSelected ? "border-primary bg-indigo-50" : "border-border bg-background hover:border-zinc-300",
            )}
          >
            <input
              type="radio"
              name="method"
              value={method.key}
              checked={isSelected}
              onChange={() => onChange(method.key)}
              className="size-5 shrink-0 cursor-pointer accent-primary lg:size-[18px]"
            />
            <span className="lg:hidden">{method.label}</span>
            <span className="hidden lg:inline">{method.shortLabel}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
