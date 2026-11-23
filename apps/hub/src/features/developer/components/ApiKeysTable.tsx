import { cn } from "@/lib/utils.ts";
import type { ApiKey } from "@sondohub/contracts";
import { formatDate, formatExpiry, keyStatus } from "../api-keys.ts";
import ApiKeyActions, { type ApiKeyActionHandlers } from "./ApiKeyActions.tsx";
import ApiKeyStatus from "./ApiKeyStatus.tsx";

type ApiKeysTableProps = ApiKeyActionHandlers & {
  keys: ApiKey[];
  selectedId: string | null;
  onSelect: (key: ApiKey) => void;
};

export default function ApiKeysTable({ keys, selectedId, onSelect, ...actions }: ApiKeysTableProps) {
  return (
    // relative: prende os textos sr-only (absolutos) dentro da rolagem; sem isso a página inteira ganha barra horizontal.
    <div className="relative overflow-x-auto rounded-2xl border border-line-subtle bg-sidebar">
      <table className="w-full min-w-[760px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line-divider text-xs font-bold tracking-wider whitespace-nowrap text-ink-label uppercase">
            <th className="px-5 py-3.5 font-bold">Chave</th>
            <th className="px-5 py-3.5 font-bold">Status</th>
            <th className="px-5 py-3.5 font-bold">Expira</th>
            <th className="px-5 py-3.5 font-bold">Último uso</th>
            <th className="px-5 py-3.5 font-bold">Criada em</th>
            <th className="w-14 px-5 py-3.5">
              <span className="sr-only">Ações</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <ApiKeyRow
              key={key.id}
              apiKey={key}
              selected={key.id === selectedId}
              onSelect={() => onSelect(key)}
              {...actions}
            />
          ))}
        </tbody>
      </table>

      {keys.length === 0 && (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhuma chave encontrada.</p>
      )}
    </div>
  );
}

type ApiKeyRowProps = ApiKeyActionHandlers & { apiKey: ApiKey; selected: boolean; onSelect: () => void };

function ApiKeyRow({ apiKey, selected, onSelect, ...actions }: ApiKeyRowProps) {
  const status = keyStatus(apiKey);

  return (
    <tr
      className={cn(
        "relative border-b border-line-divider/60 transition-colors last:border-b-0 hover:bg-card",
        selected && "bg-card",
        status !== "active" && "text-muted-foreground",
      )}
    >
      <td className="px-5 py-3.5">
        <div className="flex min-w-0 flex-col gap-1">
          {/* O ::after estica o botão pela linha inteira: clicar em qualquer ponto abre os detalhes. */}
          <button
            type="button"
            onClick={onSelect}
            aria-haspopup="dialog"
            title={apiKey.name}
            className="max-w-[300px] truncate text-left text-sm font-semibold text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {apiKey.name}
          </button>
          <span className="font-mono text-[12.5px] text-muted-foreground">{apiKey.hint}</span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <ApiKeyStatus status={status} />
      </td>
      <td className="px-5 py-3.5 text-[13px] whitespace-nowrap text-ink-body">{formatExpiry(apiKey.expiresAt)}</td>
      <td className="px-5 py-3.5 text-[13px] whitespace-nowrap text-ink-body">
        {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : <span aria-label="Nunca usada">—</span>}
      </td>
      <td className="px-5 py-3.5 text-[13px] whitespace-nowrap text-ink-body">{formatDate(apiKey.createdAt)}</td>
      {/* z-10 deixa o menu por cima do link esticado da linha */}
      <td className="relative z-10 px-3 py-2 text-right">
        <ApiKeyActions apiKey={apiKey} {...actions} />
      </td>
    </tr>
  );
}
