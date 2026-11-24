import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Mic, RotateCcw, SendHorizontal, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import type { MensagemChat } from "../use-assistente-chat.ts";

type Props = {
  /** Nome que a pessoa deu ao assistente; vazio mostra "Assistente de IA". */
  nome: string;
  mensagens: MensagemChat[];
  pensando: boolean;
  conectando: boolean;
  erro: string;
  /** Perguntas rápidas da pessoa (já filtradas pelas ativas). */
  sugestoes: string[];
  /** A resposta também é lida em voz alta. */
  vozLigada: boolean;
  falando: boolean;
  onVoz: (ligada: boolean) => void;
  onEnviar: (texto: string) => void;
  onNovaConversa: () => void;
  onTrocarParaVoz: () => void;
  onFechar: () => void;
};

/** Sem perguntas rápidas cadastradas, o chat mostra estas. */
const SUGESTOES_PADRAO = ["Quais aplicativos eu tenho?", "Abre o meu perfil", "Onde estou conectado?"];

const botaoIcone =
  "inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 md:size-7";

/** Painel do chat de texto: histórico, campo de mensagem e atalhos para voz e nova conversa. */
export function ChatAssistente({
  nome,
  mensagens,
  pensando,
  conectando,
  erro,
  sugestoes,
  vozLigada,
  falando,
  onVoz,
  onEnviar,
  onNovaConversa,
  onTrocarParaVoz,
  onFechar,
}: Props) {
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [mensagens, pensando]);

  useEffect(() => {
    campoRef.current?.focus();
  }, []);

  function enviar(valor: string) {
    const limpo = valor.trim();
    if (!limpo) return;
    onEnviar(limpo);
    setTexto("");
  }

  return (
    <section
      aria-label="Chat com o assistente"
      className="pointer-events-auto flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-sm shadow-lg"
    >
      <header className="flex items-center gap-1 border-b border-border bg-muted/50 py-2 pr-2 pl-3">
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          {nome || "Assistente de IA"}
        </h2>
        <button
          type="button"
          aria-label="Conversar por voz"
          title="Conversar por voz"
          onClick={onTrocarParaVoz}
          className={botaoIcone}
        >
          <Mic className="size-4" />
        </button>
        <button
          type="button"
          aria-label={vozLigada ? "Silenciar respostas" : "Ler respostas em voz alta"}
          aria-pressed={vozLigada}
          title={vozLigada ? "Silenciar respostas" : "Ler respostas em voz alta"}
          onClick={() => onVoz(!vozLigada)}
          className={cn(botaoIcone, falando && "text-primary")}
        >
          {vozLigada ? (
            <Volume2 className={cn("size-4", falando && "animate-pulse")} />
          ) : (
            <VolumeX className="size-4" />
          )}
        </button>
        <button
          type="button"
          aria-label="Nova conversa"
          title="Nova conversa"
          disabled={mensagens.length === 0}
          onClick={onNovaConversa}
          className={cn(botaoIcone, "disabled:pointer-events-none disabled:opacity-40")}
        >
          <RotateCcw className="size-4" />
        </button>
        <button type="button" aria-label="Fechar chat" title="Fechar" onClick={onFechar} className={botaoIcone}>
          <X className="size-4" />
        </button>
      </header>

      <div className="h-[min(20rem,45dvh)] space-y-2 overflow-y-auto overscroll-contain p-3" aria-live="polite">
        {mensagens.length === 0 ? (
          <div className="space-y-3 pt-2 text-center">
            <p className="text-xs text-muted-foreground">
              Pergunte sobre os seus aplicativos e a sua conta, ou peça para abrir uma tela.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {(sugestoes.length > 0 ? sugestoes : SUGESTOES_PADRAO).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => enviar(s)}
                  className="min-h-9 cursor-pointer rounded-full border border-border bg-background px-3 text-xs text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {mensagens.map((m) =>
          m.papel === "sistema" ? (
            <p key={m.id} className="px-2 text-center text-[11px] text-muted-foreground">
              {m.texto}
            </p>
          ) : (
            <div key={m.id} className={cn("flex", m.papel === "usuario" ? "justify-end" : "justify-start")}>
              <p
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap",
                  m.papel === "usuario"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-muted text-foreground",
                )}
              >
                {m.texto}
              </p>
            </div>
          ),
        )}

        {pensando ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {conectando ? "Conectando…" : "Pensando…"}
          </p>
        ) : null}
        {erro ? (
          <p role="alert" className="text-xs text-destructive">
            {erro}
          </p>
        ) : null}
        <div ref={fimRef} />
      </div>

      <form
        className="relative border-t border-border transition-colors focus-within:bg-muted/30"
        onSubmit={(ev) => {
          ev.preventDefault();
          enviar(texto);
        }}
      >
        <input
          ref={campoRef}
          value={texto}
          maxLength={2000}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Digite sua mensagem"
          aria-label="Mensagem para o assistente"
          onChange={(ev) => setTexto(ev.target.value)}
          className="block h-14 w-full border-0 bg-transparent py-0 pr-16 pl-4 text-base outline-none placeholder:text-muted-foreground md:h-12 md:text-sm"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={!texto.trim()}
          className="absolute top-1/2 right-2 inline-flex size-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl bg-primary text-primary-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 md:size-9"
        >
          <SendHorizontal className="size-4" />
        </button>
      </form>
    </section>
  );
}
