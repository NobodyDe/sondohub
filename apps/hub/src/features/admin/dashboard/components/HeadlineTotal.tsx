import { formatNumber } from "../format.ts";
import Delta from "./Delta.tsx";

type HeadlineTotalProps = { total: number; previous: number };

/** "+23" no canto do card, com a diferença absoluta para o período anterior embaixo. */
export default function HeadlineTotal({ total, previous }: HeadlineTotalProps) {
  return (
    <div className="shrink-0 text-right">
      <p className="text-[22px] font-bold tabular-nums">+{formatNumber(total)}</p>
      <Delta value={total - previous} />
    </div>
  );
}
