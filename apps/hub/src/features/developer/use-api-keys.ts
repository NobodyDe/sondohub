import type { CreateApiKeyInput } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { hubApi } from "@/lib/api.ts";

export const API_KEYS_KEY = ["api-keys"];

export function useApiKeys() {
  return useQuery({ queryKey: API_KEYS_KEY, queryFn: hubApi.apiKeys });
}

/** Toda mudança recarrega a lista: tabela, painel e contagem nas configurações leem dela. */
function useInvalidateKeys() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: API_KEYS_KEY });
}

export function useCreateApiKey() {
  const onSuccess = useInvalidateKeys();
  return useMutation({ mutationFn: (input: CreateApiKeyInput) => hubApi.createApiKey(input), onSuccess });
}

export function useDeleteApiKey() {
  const onSuccess = useInvalidateKeys();
  return useMutation({ mutationFn: (id: string) => hubApi.deleteApiKey(id), onSuccess });
}
