import { useId } from "react";

// O "S" da Sondotécnica: meio arco sólido em cima, meio arco listrado embaixo.
const TOP_ARC = "M160 248A170 170 0 0 1 330 78V165A83 83 0 0 0 247 248Z";
const BOTTOM_ARC = "M340 248A170 170 0 0 1 170 418V331A83 83 0 0 0 253 248Z";
const STRIPES_X = [170, 189, 208, 227, 246, 265, 284, 303, 322];

type SondoMarkProps = React.ComponentProps<"svg"> & {
  /** Classes de cada listra (cor, animação). */
  stripeClassName?: string;
  /** Classes do arco sólido. */
  arcClassName?: string;
  /** Atraso entre uma listra e a próxima, em ms (para animar uma a uma). */
  stripeDelay?: number;
};

export function SondoMark({
  stripeClassName,
  arcClassName,
  stripeDelay = 0,
  ...props
}: SondoMarkProps) {
  // Cada logo na página precisa do próprio clipPath.
  const clipId = useId();

  return (
    <svg viewBox="160 78 180 340" fill="currentColor" {...props}>
      <defs>
        <clipPath id={clipId}>
          <path d={BOTTOM_ARC} />
        </clipPath>
      </defs>
      <path d={TOP_ARC} className={arcClassName} />
      <g clipPath={`url(#${clipId})`}>
        {STRIPES_X.map((x, i) => (
          <rect
            key={x}
            x={x}
            y={248}
            width={9}
            height={170}
            className={stripeClassName}
            style={stripeDelay ? { animationDelay: `${i * stripeDelay}ms` } : undefined}
          />
        ))}
      </g>
    </svg>
  );
}
