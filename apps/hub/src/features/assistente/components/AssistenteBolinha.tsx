import { useEffect, useRef, useState } from "react";
import { AudioLines, Bot, GripHorizontal, Hand, Loader2, MessageSquare, Mic, Settings, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { cn } from "@/lib/utils.ts";
import { assistenteApi } from "../api.ts";
import { CardConfirmacao } from "../cards/CardConfirmacao.tsx";
import { usePropostasCards } from "../cards/use-propostas-cards.ts";
import { useEstadoTelaAssistente } from "../contexto-tela/contexto-tela-store.ts";
import { useExecutarAcoes } from "../executar-acoes.ts";
import type { ModoMic } from "../lib/mic-mode.ts";
import { useAssistenteChat } from "../use-assistente-chat.ts";
import { useAssistenteConfig, useAtualizarConfigAssistente } from "../use-assistente-config.ts";
import { useAssistenteVoz } from "../use-assistente-voz.ts";
import { ChatAssistente } from "./ChatAssistente.tsx";

const ROTULO = {
  idle: "Falar com o assistente",
  conectando: "Conectando…",
  ouvindo: "Ouvindo",
  falando: "Falando",
} as const;

const MODOS: { id: ModoMic; rotulo: string; icone: typeof Mic }[] = [
  { id: "aberto", rotulo: "Mic aberto", icone: Mic },
  { id: "apertar", rotulo: "Segurar", icone: Hand },
];

/** O robô não aparece nas telas de entrada: ainda não há sessão. */
const ROTAS_SEM_ROBO = ["/login", "/redefinir-senha"];

const campoDeTexto = (alvo: EventTarget | null) => {
  const el = alvo as HTMLElement | null;
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable);
};

/** Bolinha flutuante do Assistente de IA. Some quando está desligado, sem autorização ou sem chave. */
export function AssistenteBolinha() {
  const { pathname } = useLocation();
  const estadoTela = useEstadoTelaAssistente();
  const { cards, adicionarProposta, confirmarProposta, cancelarProposta, limparCards } = usePropostasCards();
  const executarAcao = useExecutarAcoes(adicionarProposta);
  const { data: config, refetch } = useAssistenteConfig();
  // O robô vive acima do router: sem isto, o 401 de antes do login (ou a config de outra conta) ficaria no cache.
  useEffect(() => {
    if (!ROTAS_SEM_ROBO.includes(pathname)) void refetch();
  }, [pathname, refetch]);
  const atualizarConfig = useAtualizarConfigAssistente();
  const voz = useAssistenteVoz(executarAcao, config?.modoMic, (novo) => {
    // Se falhar o modo vale só nesta sessão; a tela de configurações mostra o que está salvo.
    void assistenteApi.salvarPreferencias({ modoMic: novo }).then(atualizarConfig).catch(() => {});
  });
  const chat = useAssistenteChat(executarAcao);
  const { fase, erro, legenda, modo, segurando, definirModo, segurar, iniciar, encerrar, enviarContexto } = voz;
  const { encerrar: encerrarChat, enviarContexto: enviarContextoChat } = chat;

  const ativo = config?.habilitado === true && !ROTAS_SEM_ROBO.includes(pathname);
  const chatDisponivel = ativo && config?.chatTexto === true;
  const prefereTexto = chatDisponivel && config?.preferencia === "texto";
  const [chatAberto, setChatAberto] = useState(false);
  // Perguntas rápidas: recarrega a cada abertura do chat (a lista pode ter mudado nas configurações).
  const [sugestoes, setSugestoes] = useState<string[]>([]);
  const emSessao = fase !== "idle";
  const apertar = modo === "apertar";

  const painelRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const painelVisivel = emSessao || !!erro;

  // Painel fechado: a próxima abertura volta para perto da bolinha.
  if (!painelVisivel && pos) setPos(null);

  // Janela redimensionada: mantém o painel dentro da tela.
  useEffect(() => {
    if (!pos) return;
    const ajustar = () => {
      const p = painelRef.current?.getBoundingClientRect();
      if (!p) return;
      setPos((a) =>
        a
          ? {
              x: Math.max(0, Math.min(a.x, window.innerWidth - p.width)),
              y: Math.max(0, Math.min(a.y, window.innerHeight - p.height)),
            }
          : a,
      );
    };
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [pos]);

  // Snapshot da tela para a ferramenta ver_tela (debounce; só com a sessão aberta).
  useEffect(() => {
    if (!emSessao && !chatAberto) return;
    const t = window.setTimeout(() => {
      const contexto = {
        rota: pathname,
        titulo: document.title,
        breakpoint: window.matchMedia("(max-width: 767px)").matches ? "mobile" : "desktop",
        ...(estadoTela ? { estado: estadoTela } : {}),
      };
      if (emSessao) enviarContexto(contexto);
      else enviarContextoChat(contexto);
    }, 300);
    return () => window.clearTimeout(t);
  }, [emSessao, chatAberto, pathname, estadoTela, enviarContexto, enviarContextoChat]);

  useEffect(() => {
    if (!chatAberto) return;
    let vivo = true;
    assistenteApi
      .perguntas()
      .then((lista) => vivo && setSugestoes(lista.filter((p) => p.ativo).map((p) => p.texto)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [chatAberto]);

  // Desligou (ou perdeu a autorização): fecha tudo.
  useEffect(() => {
    if (!ativo) encerrar();
  }, [ativo, encerrar]);
  useEffect(() => {
    if (chatDisponivel) return;
    setChatAberto(false);
    encerrarChat();
  }, [chatDisponivel, encerrarChat]);

  // Desktop: segurar a barra de espaço fala (fora de campos de texto).
  useEffect(() => {
    if (!emSessao || !apertar) return;
    const aoApertar = (ev: KeyboardEvent) => {
      if (ev.code !== "Space" || ev.repeat || campoDeTexto(ev.target)) return;
      ev.preventDefault();
      segurar(true);
    };
    const aoSoltar = (ev: KeyboardEvent) => {
      if (ev.code === "Space") segurar(false);
    };
    window.addEventListener("keydown", aoApertar);
    window.addEventListener("keyup", aoSoltar);
    return () => {
      window.removeEventListener("keydown", aoApertar);
      window.removeEventListener("keyup", aoSoltar);
    };
  }, [emSessao, apertar, segurar]);

  if (!ativo) return null;

  const abrirChat = () => {
    encerrar();
    setChatAberto(true);
  };
  const abrirVoz = () => {
    setChatAberto(false);
    void iniciar();
  };

  const texto = erro || legenda.assistente || legenda.usuario;
  const Icone = fase === "conectando" ? Loader2 : fase === "falando" ? AudioLines : Bot;
  const escutando = fase === "ouvindo" && (!apertar || segurando);
  const rotuloFase = fase === "ouvindo" && apertar && !segurando ? "Segure para falar" : ROTULO[fase];

  return (
    <div className="pointer-events-none fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col items-end gap-2 md:right-6 md:bottom-6">
      {chatAberto && chatDisponivel ? (
        <ChatAssistente
          nome={config?.nome ?? ""}
          mensagens={chat.mensagens}
          pensando={chat.pensando}
          conectando={chat.conectando}
          erro={chat.erro}
          sugestoes={sugestoes}
          vozLigada={chat.vozLigada}
          falando={chat.falando}
          cards={cards}
          onConfirmarCard={confirmarProposta}
          onCancelarCard={cancelarProposta}
          onVoz={chat.definirVoz}
          onEnviar={chat.enviar}
          onNovaConversa={() => {
            limparCards();
            chat.novaConversa();
          }}
          onTrocarParaVoz={abrirVoz}
          onFechar={() => setChatAberto(false)}
        />
      ) : null}
      {painelVisivel ? (
        <div
          ref={painelRef}
          role="status"
          style={pos ? { left: pos.x, top: pos.y } : undefined}
          className={cn(
            "pointer-events-auto w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card text-xs shadow-lg",
            pos && "fixed",
            erro ? "text-destructive" : "text-foreground",
          )}
        >
          <div className="flex items-center border-b border-border bg-muted/50">
            <p
              onPointerDown={(e) => {
                const painel = painelRef.current?.getBoundingClientRect();
                if (!painel) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                arrasto.current = { dx: e.clientX - painel.left, dy: e.clientY - painel.top };
                setPos({ x: painel.left, y: painel.top });
              }}
              onPointerMove={(e) => {
                const painel = painelRef.current?.getBoundingClientRect();
                if (!arrasto.current || !painel) return;
                setPos({
                  x: Math.min(Math.max(0, e.clientX - arrasto.current.dx), window.innerWidth - painel.width),
                  y: Math.min(Math.max(0, e.clientY - arrasto.current.dy), window.innerHeight - painel.height),
                });
              }}
              onPointerUp={() => (arrasto.current = null)}
              onPointerCancel={() => (arrasto.current = null)}
              title="Arraste para mover"
              className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 px-3 py-3 font-semibold tracking-wider text-muted-foreground uppercase select-none active:cursor-grabbing"
            >
              <GripHorizontal className="size-4 shrink-0" />
              <span className="truncate">{erro ? "Assistente" : rotuloFase}</span>
            </p>
            <button
              type="button"
              aria-label="Encerrar conversa com o assistente"
              title="Encerrar"
              onClick={encerrar}
              className="mr-2 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 md:size-7"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="space-y-2 p-3">
            {texto ? <p className="line-clamp-4 break-words">{texto}</p> : null}

            {cards.length > 0 ? (
              <div className="space-y-2">
                {cards.map((item) => (
                  <CardConfirmacao
                    key={item.proposta.id}
                    item={item}
                    onConfirmar={confirmarProposta}
                    onCancelar={cancelarProposta}
                  />
                ))}
              </div>
            ) : null}

            {emSessao ? (
              <>
                <div role="radiogroup" aria-label="Modo do microfone" className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
                  {MODOS.map(({ id, rotulo, icone: Ic }) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={modo === id}
                      onClick={() => definirModo(id)}
                      className={cn(
                        "flex h-11 items-center justify-center gap-1.5 rounded-lg text-xs font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 md:h-9",
                        modo === id && "bg-card text-foreground shadow-sm",
                      )}
                    >
                      <Ic className="size-3.5" />
                      {rotulo}
                    </button>
                  ))}
                </div>

                {apertar ? (
                  <button
                    type="button"
                    disabled={fase === "conectando"}
                    onPointerDown={(ev) => {
                      ev.currentTarget.setPointerCapture(ev.pointerId);
                      segurar(true);
                    }}
                    onPointerUp={() => segurar(false)}
                    onPointerCancel={() => segurar(false)}
                    onContextMenu={(ev) => ev.preventDefault()}
                    className={cn(
                      "flex h-14 w-full touch-none items-center justify-center gap-1.5 rounded-xl text-sm font-semibold outline-none select-none md:h-12",
                      segurando ? "bg-primary text-primary-foreground" : "border border-border bg-background text-foreground",
                    )}
                  >
                    <Mic className="size-4 shrink-0" />
                    {segurando ? "Solte" : "Falar"}
                  </button>
                ) : null}
                {apertar ? <p className="hidden text-[11px] text-muted-foreground md:block">Ou segure a barra de espaço.</p> : null}

                <div className="flex gap-2">
                  {chatDisponivel ? (
                    <button
                      type="button"
                      onClick={abrirChat}
                      className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <MessageSquare className="size-3.5" />
                      Usar o chat
                    </button>
                  ) : null}
                  <Link
                    to="/assistente"
                    className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Settings className="size-3.5" />
                    Configurações
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          if (chatAberto) setChatAberto(false);
          else if (emSessao) encerrar();
          else if (prefereTexto) setChatAberto(true);
          else void iniciar();
        }}
        aria-label={
          emSessao || chatAberto
            ? "Encerrar conversa com o assistente"
            : prefereTexto
              ? "Abrir o chat com o assistente"
              : ROTULO.idle
        }
        className={cn(
          "pointer-events-auto relative flex size-14 items-center justify-center rounded-full bg-linear-to-br from-primary to-primary/65 text-primary-foreground shadow-lg ring-1 ring-primary/30 outline-none transition-transform focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95",
          escutando && "animate-pulse",
        )}
      >
        {(emSessao && fase !== "conectando") || chatAberto ? (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full border border-border bg-card text-foreground">
            <X className="size-3" />
          </span>
        ) : null}
        <Icone className={cn("size-6", fase === "conectando" && "animate-spin")} />
      </button>
    </div>
  );
}
