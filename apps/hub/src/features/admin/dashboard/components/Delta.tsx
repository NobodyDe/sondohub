import { cn } from "@/lib/utils.ts";

type DeltaProps = {
  /** Diferença já calculada; null quando não há base de comparação. */
  value: number | null;
  unit?: "%" | "";
  className?: string;
};

/** "+9% vs anterior" em verde ou "-3 vs anterior" em vermelho. */
export default function Delta({ value, unit = "", className }: DeltaProps) {
  if (value === null) return null;
  const sign = value > 0 ? "+" : "";
  return (
    <span
      className={cn(
        "text-[12.5px] font-bold",
        value >= 0 ? "text-online" : "text-danger-text",
        className,
      )}
    >
      {sign}
      {value}
      {unit} vs anterior
    </span>
  );
}
