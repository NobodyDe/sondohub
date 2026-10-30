import { Box, FileText, Layers, Video, type LucideIcon } from "lucide-react";
import { SondoMark } from "./sondo-mark.tsx";

type HubApp = { name: string; description: string; icon: LucideIcon };

const APPS: HubApp[] = [
  {
    name: "SondoApp",
    description:
      "Gestão de registros por níveis hierárquicos e documentação fotográfica dos projetos.",
    icon: FileText,
  },
  {
    name: "Orion",
    description:
      "Monitoramento de câmeras em tempo real, com várias transmissões ao mesmo tempo.",
    icon: Video,
  },
  {
    name: "SondoTwins",
    description:
      "Gêmeo digital com modelo 3D, métricas operacionais e gestão de sensores.",
    icon: Box,
  },
  {
    name: "SondoVerso",
    description:
      "Visualização Geolocalizada no globo de arquivos, modelos 3d e banco de dados",
    icon: Layers,
  },
];

const YEAR = new Date().getFullYear();

/** Painel de apresentação do SondoHub: fica no degradê 1 nos dois modos. */
export function BrandPanel() {
  return (
    <section
      aria-labelledby="hub-title"
      className="relative flex flex-col justify-between gap-7 overflow-hidden bg-g-deep px-6 pt-7 pb-9 text-white lg:flex-[1.3_1_0%] lg:gap-10 lg:px-16 lg:py-12 lg:[@media(max-height:55rem)]:gap-4 lg:[@media(max-height:55rem)]:py-7"
    >
      {/* O "S" grande saindo da borda; as listras sobem uma a uma ao abrir. */}
      <SondoMark
        aria-hidden="true"
        className="pointer-events-none absolute -top-6 -right-16 h-[300px] w-auto lg:top-[4%] lg:-right-[150px] lg:h-[92%]"
        arcClassName="fill-white/[0.07] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000"
        stripeClassName="fill-[#60efff]/30 origin-bottom [transform-box:fill-box] motion-safe:animate-stripe-rise"
        stripeDelay={60}
      />

      <div className="relative flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-white">
          <SondoMark
            role="img"
            aria-label="Logo Sondotécnica"
            className="h-8 w-auto text-primary"
          />
        </span>
        <span className="text-[17px] font-bold tracking-[-0.01em]">
          Sondotécnica
        </span>
      </div>

      <div className="relative flex max-w-[500px] flex-col gap-5 lg:[@media(max-height:55rem)]:gap-3">
        <h1
          id="hub-title"
          className="text-[52px] leading-[0.95] font-extrabold tracking-[-0.045em] lg:text-[88px] lg:[@media(max-height:55rem)]:text-[60px]"
        >
          SondoHub
        </h1>
        <p className="max-w-[30em] text-lg leading-relaxed text-white/80 lg:[@media(max-height:55rem)]:text-[15px]">
          A central de aplicações da Sondotécnica. Um único acesso para as
          ferramentas que simplificam o seu trabalho, do registro em campo ao
          gêmeo digital.
        </p>
      </div>

      <div className="relative hidden max-w-[480px] flex-col gap-7 lg:[@media(min-height:37.5rem)]:flex lg:[@media(max-height:55rem)]:gap-4">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-white/80">
            Aplicações disponíveis
          </h2>
          <ul className="border-b border-white/15">
            {APPS.map(({ name, description, icon: Icon }) => (
              <li
                key={name}
                className="flex items-start gap-4 border-t border-white/15 py-3.5 lg:[@media(max-height:55rem)]:py-1.5"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-white/5 text-[#60efff]">
                  <Icon
                    className="size-5"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold lg:[@media(max-height:55rem)]:text-[15px]">
                    {name}
                  </span>
                  <span className="text-sm leading-normal text-white/80 lg:[@media(max-height:55rem)]:text-xs">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-[13px] text-white/70">© {YEAR} Sondotécnica</p>
      </div>
    </section>
  );
}
