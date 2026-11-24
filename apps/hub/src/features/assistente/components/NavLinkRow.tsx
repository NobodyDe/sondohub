import { ChevronRight } from "lucide-react";
import { Link } from "react-router";

export default function NavLinkRow({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 rounded-[10px] border border-input px-4 py-3 no-underline transition-colors hover:bg-secondary">
      <span className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">{label}</span>
        <span className="text-[13px] text-muted-foreground">{hint}</span>
      </span>
      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
