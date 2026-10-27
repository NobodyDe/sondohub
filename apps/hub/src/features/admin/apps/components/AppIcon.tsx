import { useState } from "react";
import { cn } from "@/lib/utils.ts";

type AppIconProps = { name: string; src: string; className?: string };

/** O ícone do app; se não carregar (ou não houver), a inicial sobre o degradê. */
export default function AppIcon({ name, src, className }: AppIconProps) {
  // Guarda QUAL src falhou: quando o src muda, a imagem nova ganha outra chance, sem useEffect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src)
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center bg-g-royal font-extrabold text-white",
          className,
        )}
      >
        {name.trim()[0]?.toUpperCase() ?? "?"}
      </span>
    );

  return (
    <img
      src={src}
      alt=""
      onError={() => setFailedSrc(src)}
      className={cn("shrink-0 object-cover", className)}
    />
  );
}
