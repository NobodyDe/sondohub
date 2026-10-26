import { LockKeyhole, Star, UserRound, type LucideIcon } from "lucide-react";
import { Link } from "react-router";

type BannerProps = {
  userName: string;
};

export default function Banner({ userName }: BannerProps) {
  return (
    <section
      aria-labelledby="banner-title"
      className="flex flex-wrap items-center gap-8 rounded-[28px] bg-g-hero px-6 py-10 text-white md:px-12"
    >
      <div className="flex flex-[1_1_380px] flex-col gap-3.5">
        <span className="flex items-center gap-2 self-start rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold tracking-wide">
          <LockKeyhole className="size-3.5" aria-hidden />
          LOGIN ÚNICO ATIVO
        </span>
        <h2 id="banner-title" className="text-4xl leading-tight font-extrabold tracking-tight">
          {firstName(userName)}, tudo da Sondotecnica em um só lugar
        </h2>
        <p className="text-[17px] leading-relaxed text-ink-hero">
          Você já está conectado. Abra qualquer aplicativo sem precisar entrar de novo.
        </p>
      </div>

      <nav aria-label="Atalhos" className="grid flex-[1_1_360px] grid-cols-2 gap-3.5">
        <QuickLink to="/favoritos" label="Ver meus favoritos" icon={Star} iconClassName="text-favorite" />
        <QuickLink to="/conta" label="Editar minha conta" icon={UserRound} iconClassName="text-accent-sky" />
      </nav>
    </section>
  );
}

type QuickLinkProps = {
  to: string;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
};

function QuickLink({ to, label, icon: Icon, iconClassName }: QuickLinkProps) {
  return (
    <Link
      to={to}
      className="flex flex-col gap-3.5 rounded-2xl bg-sunken p-5 text-foreground no-underline transition-colors hover:bg-sunken/70"
    >
      <Icon className={`size-[22px] ${iconClassName}`} strokeWidth={1.8} aria-hidden />
      <span className="text-[15px] leading-snug font-bold">{label}</span>
    </Link>
  );
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0];
}
