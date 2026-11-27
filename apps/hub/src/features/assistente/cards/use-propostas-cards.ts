import type { AssistentePropostaResumo } from "@sondohub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { assistenteApi } from "../api.ts";
import { errorMessage } from "../error-message.ts";
import type { CardPropostaItem } from "./card.types.ts";

/**
 * Gerencia os cards de confirmação (Human-in-the-Loop) exibidos no chat e no painel de voz.
 * Quando o Master confirma, grava via HTTP e invalida o cache do React Query para atualizar a tela ao fundo.
 */
export function usePropostasCards() {
  const queryClient = useQueryClient();
  const [cards, setCards] = useState<CardPropostaItem[]>([]);

  const adicionarProposta = useCallback((proposta: AssistentePropostaResumo) => {
    setCards((atuais) => {
      const semMesmoId = atuais.filter((c) => c.proposta.id !== proposta.id);
      return [...semMesmoId, { proposta, status: "pendente" }];
    });
  }, []);

  const confirmarProposta = useCallback(
    async (id: string) => {
      setCards((atuais) => atuais.map((c) => (c.proposta.id === id ? { ...c, status: "confirmando" } : c)));
      try {
        const res = await assistenteApi.confirmarProposta(id);
        setCards((atuais) =>
          atuais.map((c) =>
            c.proposta.id === id
              ? { ...c, status: res.ok ? "confirmada" : "erro", mensagemResultado: res.mensagem }
              : c,
          ),
        );
        if (res.ok) {
          void queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
          void queryClient.invalidateQueries({ queryKey: ["assistente"] });
        }
      } catch (error) {
        setCards((atuais) =>
          atuais.map((c) =>
            c.proposta.id === id
              ? { ...c, status: "erro", mensagemResultado: errorMessage(error, "Não foi possível confirmar a ação.") }
              : c,
          ),
        );
      }
    },
    [queryClient],
  );

  const cancelarProposta = useCallback(async (id: string) => {
    setCards((atuais) =>
      atuais.map((c) =>
        c.proposta.id === id ? { ...c, status: "cancelada", mensagemResultado: "Operação cancelada." } : c,
      ),
    );
    await assistenteApi.cancelarProposta(id).catch(() => undefined);
  }, []);

  const limparCards = useCallback(() => setCards([]), []);

  return { cards, adicionarProposta, confirmarProposta, cancelarProposta, limparCards };
}
