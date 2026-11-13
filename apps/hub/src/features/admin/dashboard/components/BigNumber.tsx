import type { ReactNode } from "react";

type BigNumberProps = { value: string; note?: ReactNode };

/** O número grande dos cards, com um complemento pequeno ao lado ("de 162 cadastrados"). */
export default function BigNumber({ value, note }: BigNumberProps) {
  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-2 text-[34px] leading-tight font-bold tracking-[-0.03em] tabular-nums">
      {value}
      {note && (
        <span className="text-[13px] font-medium tracking-normal text-muted-foreground">
          {note}
        </span>
      )}
    </p>
  );
}
