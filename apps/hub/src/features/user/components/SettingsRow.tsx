import type { ReactNode } from "react";

type SettingsRowProps = {
  title: string;
  description: string;
  children: ReactNode;
};

/** Uma faixa da página: título e explicação à esquerda, o controle à direita. No celular, um embaixo do outro. */
export default function SettingsRow({
  title,
  description,
  children,
}: SettingsRowProps) {
  return (
    <section className="grid gap-4 border-t border-line-divider py-7 md:grid-cols-[240px_1fr] md:gap-10">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-bold">{title}</h2>
        <p className="text-[13px] text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
