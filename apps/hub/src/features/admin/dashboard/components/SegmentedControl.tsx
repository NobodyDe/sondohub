import { cn } from "@/lib/utils.ts";

type SegmentedControlProps<T extends string> = {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
};

/** Grupo de botões em que só um fica ligado (período, Mais/Menos, Aberturas/Cliques). */
export default function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex shrink-0 gap-0.5 rounded-[10px] border border-border bg-section p-[3px]"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[7px] font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--border)]",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-[13px]",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
