import { ChevronLeft } from "lucide-react";
import { Link } from "react-router";

export default function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 self-start rounded-[10px] py-2 pr-3 pl-2 text-sm font-semibold text-ink-nav no-underline transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ChevronLeft className="size-[18px]" aria-hidden />
      {label}
    </Link>
  );
}
