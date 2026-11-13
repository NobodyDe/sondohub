import { Dialog } from "@base-ui/react/dialog";
import {
  Camera,
  LogIn,
  MousePointerClick,
  UserRoundSearch,
  type LucideIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button.tsx";

type Tip = { icon: LucideIcon; title: string; text: ReactNode };

const TIPS: Tip[] = [
  {
    icon: LogIn,
    title: "Entre uma vez",
    text: "Faça login com seu e-mail corporativo e senha. Depois disso, os aplicativos abrem sem pedir login de novo.",
  },
  {
    icon: MousePointerClick,
    title: "Abra um aplicativo",
    text: "Clique no card do aplicativo e você será levado direto para ele.",
  },
  {
    icon: Camera,
    title: "Troque sua foto",
    text: (
      <>
        Em{" "}
        <Link to="/perfil" className="font-semibold text-link hover:text-link-hover">
          Meu perfil
        </Link>
        , use Trocar foto para enviar uma imagem nova.
      </>
    ),
  },
  {
    icon: UserRoundSearch,
    title: "Não encontrou um aplicativo?",
    text: "Você vê só os aplicativos liberados para você. Fale com o administrador para pedir acesso.",
  },
];

/** Modal de ajuda. Quem chama decide a aparência do botão que abre (trigger). */
export default function HelpDialog({ trigger }: { trigger: ReactElement }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger render={trigger} />
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-2xl bg-popover p-6 text-popover-foreground ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <Dialog.Title className="text-xl font-bold tracking-tight">
            Como usar o SondoHub
          </Dialog.Title>

          <ul className="flex flex-col gap-5">
            {TIPS.map((tip) => (
              <TipItem key={tip.title} {...tip} />
            ))}
          </ul>

          <Dialog.Close render={<Button size="lg" className="self-end px-5" />}>
            Entendi
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function TipItem({ icon: Icon, title, text }: Tip) {
  return (
    <li className="flex gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
        <Icon className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <div className="flex flex-col gap-1">
        <span className="font-semibold">{title}</span>
        <p className="text-sm leading-relaxed text-ink-body">{text}</p>
      </div>
    </li>
  );
}
