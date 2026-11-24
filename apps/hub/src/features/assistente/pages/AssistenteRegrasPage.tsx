import type { AssistenteRegra } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import BackLink from "@/components/BackLink.tsx";
import Switch from "@/components/Switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import { assistenteApi } from "../api.ts";
import AssistentePageShell from "../components/AssistentePageShell.tsx";
import { errorMessage } from "../error-message.ts";

const MAX_RULES = 40;
const MAX_NAME = 80;
const MAX_TEXT = 500;

// Espelha apps/api/src/modules/assistente/ferramentas.ts: o servidor recusa o nome que não existir lá.
const TOOLS = [
  "listar_meus_apps",
  "meu_perfil",
  "resumo_painel",
  "resumo_usuarios",
  "buscar_usuarios",
  "detalhe_usuario",
  "acao_tela",
  "ver_tela",
  "lembrar",
  "esquecer",
  "listar_memorias",
  "pesquisar_web",
  "previsao_tempo",
];

const DESCRIPTION = {
  personal: "O que o assistente pode e não pode falar com você. Regras da empresa sempre prevalecem.",
  global: "Valem para todos os usuários e não podem ser desligadas por voz.",
};

/** `global`: regras da empresa (só Master, dentro do /admin). Sem ele: regras pessoais. */
export function AssistenteRegrasPage({ global = false }: { global?: boolean }) {
  if (global)
    return (
      <div className="mx-auto flex max-w-[860px] flex-col gap-8">
        <BackLink to="/admin/assistente" label="Assistente" />
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Regras da empresa</h1>
          <p className="text-sm text-muted-foreground">{DESCRIPTION.global}</p>
        </header>
        <Rules global />
      </div>
    );

  return (
    <AssistentePageShell title="Regras" description={DESCRIPTION.personal} back={{ to: "/assistente", label: "Assistente" }}>
      <Rules />
    </AssistentePageShell>
  );
}

function Rules({ global }: { global?: boolean }) {
  const queryClient = useQueryClient();
  const queryKey = ["assistente", global ? "regras-globais" : "regras"];
  const rules = useQuery({ queryKey, queryFn: () => assistenteApi.regras(global) });
  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const toggle = useMutation({
    mutationFn: (rule: AssistenteRegra) => assistenteApi.editarRegra(rule.id, { ativo: !rule.ativo }, global),
    onSettled: refresh,
  });
  const del = useMutation({ mutationFn: (id: string) => assistenteApi.removerRegra(id, global), onSettled: refresh });
  const error = [toggle.error, del.error, rules.error].find(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <RuleForm global={global} full={(rules.data?.length ?? 0) >= MAX_RULES} onCreated={refresh} />
      <p className="-mt-3 text-[13px] text-muted-foreground">
        {rules.data?.length ?? 0} de {MAX_RULES} regras.
      </p>

      {error != null && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {errorMessage(error)}
        </p>
      )}

      {rules.isPending ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : rules.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma regra ainda.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line-divider rounded-[14px] border border-line-subtle">
          {rules.data?.map((rule) => (
            <li key={rule.id} className="flex items-start gap-3 px-4 py-3">
              <div className={cn("flex min-w-0 flex-1 flex-col gap-1", !rule.ativo && "opacity-60")}>
                <span className="text-sm font-semibold">{rule.nome}</span>
                <span className="text-sm break-words">{rule.texto}</span>
                {rule.bloqueia.length > 0 && (
                  <span className="text-[13px] text-muted-foreground">Bloqueia: {rule.bloqueia.join(", ")}</span>
                )}
              </div>
              <Switch checked={rule.ativo} onCheckedChange={() => toggle.mutate(rule)} label={`Ativar regra ${rule.nome}`} />
              <button
                type="button"
                aria-label={`Apagar regra ${rule.nome}`}
                onClick={() => del.mutate(rule.id)}
                className="flex size-10 shrink-0 items-center justify-center rounded-[10px] text-danger-text transition-colors hover:bg-danger-hover"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RuleForm({ global, full, onCreated }: { global?: boolean; full: boolean; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () => assistenteApi.criarRegra({ nome: name, texto: text, bloqueia: blocked }, global),
    onSuccess: () => {
      setName("");
      setText("");
      setBlocked([]);
      onCreated();
    },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-[14px] border border-line-subtle p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() && text.trim() && !full) create.mutate();
      }}
    >
      <Input aria-label="Nome da regra" placeholder="Nome da regra" value={name} maxLength={MAX_NAME} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] bg-background" />
      <Textarea aria-label="Texto da regra" placeholder="Ex.: Não fale sobre o salário de ninguém." value={text} maxLength={MAX_TEXT} onChange={(event) => setText(event.target.value)} className="min-h-20 rounded-[10px] bg-background" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[13px] text-muted-foreground">Bloquear ferramentas (opcional): o servidor recusa a chamada.</legend>
        <div className="flex flex-wrap gap-1.5">
          {TOOLS.map((tool) => (
            <button
              key={tool}
              type="button"
              aria-pressed={blocked.includes(tool)}
              onClick={() => setBlocked((current) => (current.includes(tool) ? current.filter((name) => name !== tool) : [...current, tool]))}
              className={cn(
                "rounded-lg border border-input px-2.5 py-1 font-mono text-xs transition-colors hover:bg-secondary",
                blocked.includes(tool) && "border-primary bg-primary-soft text-foreground",
              )}
            >
              {tool}
            </button>
          ))}
        </div>
      </fieldset>
      {create.isError && (
        <p role="alert" className="text-sm font-semibold text-danger-text">
          {errorMessage(create.error)}
        </p>
      )}
      <button
        type="submit"
        disabled={!name.trim() || !text.trim() || full || create.isPending}
        className="h-11 w-fit rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        Adicionar regra
      </button>
    </form>
  );
}
