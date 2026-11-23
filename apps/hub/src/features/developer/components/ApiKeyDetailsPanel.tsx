import { Dialog } from "@base-ui/react/dialog";
import { ChevronDown, ChevronUp, KeyRound, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import UserAvatar from "@/components/UserAvatar.tsx";
import { ICON_BUTTON } from "@/components/dialog-classes.ts";
import type { ApiKey, HubProfile } from "@sondohub/contracts";
import { formatExpiry, formatLongDate, keyStatus } from "../api-keys.ts";
import ApiKeyActions, { type ApiKeyActionHandlers } from "./ApiKeyActions.tsx";
import ApiKeyStatus from "./ApiKeyStatus.tsx";

type ApiKeyDetailsPanelProps = ApiKeyActionHandlers & {
  keys: ApiKey[]; // a lista como está na tela, para as setas andarem na mesma ordem
  owner: HubProfile; // a lista só traz chaves do próprio usuário: quem criou é sempre ele
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/** Painel lateral com os detalhes da chave. Fecha sozinho se a chave sumir da lista (ex.: excluída). */
export default function ApiKeyDetailsPanel({ keys, owner, selectedId, onSelect, ...actions }: ApiKeyDetailsPanelProps) {
  const index = keys.findIndex((key) => key.id === selectedId);
  const current = index === -1 ? null : keys[index];
  // Guarda a última chave mostrada para o conteúdo não sumir durante a animação de saída.
  const [shown, setShown] = useState(current);
  if (current && current !== shown) setShown(current);

  return (
    <Dialog.Root open={!!current} onOpenChange={(open) => !open && onSelect(null)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/30 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[500px] flex-col overflow-y-auto border-l border-line-subtle bg-popover text-popover-foreground shadow-2xl duration-200 outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right motion-reduce:animate-none">
          {shown && (
            <PanelContent
              apiKey={shown}
              owner={owner}
              onPrevious={index > 0 ? () => onSelect(keys[index - 1].id) : undefined}
              onNext={index !== -1 && index < keys.length - 1 ? () => onSelect(keys[index + 1].id) : undefined}
              {...actions}
            />
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

type PanelContentProps = ApiKeyActionHandlers & {
  apiKey: ApiKey;
  owner: HubProfile;
  onPrevious?: () => void;
  onNext?: () => void;
};

function PanelContent({ apiKey, owner, onPrevious, onNext, ...actions }: PanelContentProps) {
  const status = keyStatus(apiKey);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line-divider px-6 py-4">
        <span className="text-sm font-semibold">Chave de API</span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{apiKey.id}</span>
        <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="Chave anterior" className={ICON_BUTTON}>
          <ChevronUp className="size-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={onNext} disabled={!onNext} aria-label="Próxima chave" className={ICON_BUTTON}>
          <ChevronDown className="size-[18px]" aria-hidden />
        </button>
        <Dialog.Close aria-label="Fechar detalhes" className={ICON_BUTTON}>
          <X className="size-5" aria-hidden />
        </Dialog.Close>
      </header>

      <div className="flex flex-col gap-7 px-6 py-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
            <KeyRound className="size-5" strokeWidth={1.8} aria-hidden />
          </span>
          <Dialog.Title className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight">{apiKey.name}</Dialog.Title>
          <ApiKeyActions apiKey={apiKey} {...actions} />
        </div>

        <dl className="grid grid-cols-[104px_1fr] gap-x-4 sm:grid-cols-[130px_1fr] gap-y-5 text-sm">
          <Row label="Chave">
            <span className="font-mono text-[13px] break-all">{apiKey.hint}</span>
          </Row>
          <Row label="Status">
            <ApiKeyStatus status={status} />
          </Row>
          <Row label="Criada em">{formatLongDate(apiKey.createdAt)}</Row>
          <Row label="Criada por">
            <span className="flex items-center gap-2.5">
              <UserAvatar name={owner.name} url={owner.avatarUrl} className="size-7 text-[11px]" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-semibold">{owner.name}</span>
                <span className="truncate text-[13px] text-muted-foreground">{owner.email}</span>
              </span>
            </span>
          </Row>
          <Row label={status === "expired" ? "Expirou em" : "Expira em"}>{formatExpiry(apiKey.expiresAt)}</Row>
          <Row label="Último uso">{apiKey.lastUsedAt ? formatLongDate(apiKey.lastUsedAt) : "Ainda não usada"}</Row>
        </dl>

        {status === "expired" && (
          <p className="rounded-[10px] bg-sunken px-4 py-3 text-[13px] leading-relaxed text-ink-body">
            Esta chave venceu e as chamadas com ela são recusadas. Crie outra para continuar a integração.
          </p>
        )}
      </div>
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground">{children}</dd>
    </>
  );
}
