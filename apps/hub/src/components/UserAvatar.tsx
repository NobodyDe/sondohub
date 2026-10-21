import { cn } from "../lib/utils.ts";

type UserAvatarProps = {
  name: string;
  url: string | null;
  className?: string;
};

/** Foto do usuário ou, sem foto, as iniciais sobre o degradê. */
export default function UserAvatar({ name, url, className }: UserAvatarProps) {
  if (url)
    return <img src={url} alt="" className={cn("size-10 shrink-0 rounded-full object-cover", className)} />;

  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-full bg-g-violet text-sm font-bold text-white",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}

/** "Henrique dos Santos" → "HS" (primeira letra do primeiro e do último nome). */
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}
