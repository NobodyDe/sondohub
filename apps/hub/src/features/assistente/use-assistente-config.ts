import { useQuery, useQueryClient } from "@tanstack/react-query";
import { assistenteApi } from "./api.ts";

export const ASSISTENTE_CONFIG_KEY = ["assistente", "config"] as const;

/**
 * Config do assistente do usuário logado. `data` é undefined sem sessão (401) ou com a API fora:
 * a bolinha usa isso para não aparecer. Sem retry para não insistir em quem não está logado.
 */
export function useAssistenteConfig() {
  return useQuery({
    queryKey: ASSISTENTE_CONFIG_KEY,
    queryFn: assistenteApi.config,
    retry: false,
    staleTime: 30_000,
  });
}

/** Depois de salvar algo que muda a config, atualiza o cache sem esperar nova busca. */
export function useAtualizarConfigAssistente() {
  const client = useQueryClient();
  return (config: Awaited<ReturnType<typeof assistenteApi.config>>) => client.setQueryData(ASSISTENTE_CONFIG_KEY, config);
}
