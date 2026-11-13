import type { AdminUsersQuery } from "@sondohub/contracts";
import {
  keepPreviousData,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { hubApi } from "@/lib/api.ts";

/** Prefixo de tudo que a lista mostra (páginas e resumo): invalidar ele atualiza a tela inteira. */
export const USERS_LIST_KEY = ["admin", "users", "list"];
export const USERS_STALE_MS = 30_000; // voltar para uma página já vista usa o cache, sem nova requisição.

function usersPageQuery(query: AdminUsersQuery) {
  return queryOptions({
    queryKey: [...USERS_LIST_KEY, query],
    queryFn: () => hubApi.adminUsers(query),
    staleTime: USERS_STALE_MS,
  });
}

/**
 * Paginação por cursor: só dá para andar para a próxima ou voltar.
 * Para voltar, guardamos a pilha de cursores já usados (página 1 = pilha vazia).
 */
export function useUsersPage({ filter, q, take }: Omit<AdminUsersQuery, "cursor">) {
  const queryClient = useQueryClient();
  const paramsKey = `${filter}|${q}|${take}`;
  const [history, setHistory] = useState({ key: paramsKey, cursors: [] as string[] });
  // Filtro, busca ou tamanho mudou: a pilha antiga não vale mais, volta para a página 1 (sem effect).
  const cursors = history.key === paramsKey ? history.cursors : [];

  const page = useQuery({
    ...usersPageQuery({ filter, q, take, cursor: cursors.at(-1) }),
    placeholderData: keepPreviousData, // mantém a página atual na tela enquanto a próxima chega.
  });
  // Enquanto o placeholder aparece, o nextCursor é da página antiga: não pode ser usado.
  const nextCursor = page.isPlaceholderData ? null : (page.data?.nextCursor ?? null);

  // Busca a próxima página em segundo plano: o clique em "Próxima" já encontra no cache.
  useEffect(() => {
    if (nextCursor)
      queryClient.prefetchQuery(usersPageQuery({ filter, q, take, cursor: nextCursor }));
  }, [queryClient, filter, q, take, nextCursor]);

  return {
    users: page.data?.items ?? [],
    isPending: page.isPending,
    isChangingPage: page.isPlaceholderData,
    pageNumber: cursors.length + 1,
    hasPrevious: cursors.length > 0,
    hasNext: nextCursor !== null,
    goNext: () => {
      if (nextCursor) setHistory({ key: paramsKey, cursors: [...cursors, nextCursor] });
    },
    goPrevious: () => setHistory({ key: paramsKey, cursors: cursors.slice(0, -1) }),
  };
}
