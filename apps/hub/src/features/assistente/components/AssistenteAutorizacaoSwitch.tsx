import type { UserRole } from "@sondohub/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Switch from "@/components/Switch.tsx";
import { assistenteApi } from "../api.ts";

/** O Master libera o assistente de cada pessoa. O Master sempre pode, então o switch fica ligado e travado. */
export default function AssistenteAutorizacaoSwitch({ userId, role }: { userId: string; role: UserRole }) {
  const queryClient = useQueryClient();
  const key = ["assistente", "permissao", userId];
  const isMaster = role === "MASTER";

  const permission = useQuery({
    queryKey: key,
    queryFn: () => assistenteApi.permissao(userId),
    enabled: !isMaster,
    retry: false,
  });
  const save = useMutation({
    mutationFn: (authorized: boolean) => assistenteApi.salvarPermissao(userId, authorized),
    onMutate: (authorized) => queryClient.setQueryData(key, { autorizado: authorized }),
    onError: () => queryClient.invalidateQueries({ queryKey: key }), // volta ao que está gravado
  });

  const checked = isMaster || (permission.data?.autorizado ?? false);

  return (
    <section
      aria-labelledby="assistente-title"
      className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-line-subtle p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="assistente-title" className="text-base font-bold">
          Autorizar uso do assistente
        </h2>
        <p className="text-[13px] text-muted-foreground">
          {isMaster ? "O Master sempre pode usar o assistente." : "Libera o assistente de IA (voz e chat) para esta pessoa."}
        </p>
        {save.isError && (
          <p role="alert" className="text-[13px] font-semibold text-danger-text">
            Não deu para salvar. A tela voltou ao que está gravado.
          </p>
        )}
      </div>
      <div className={isMaster || permission.isPending ? "pointer-events-none opacity-60" : undefined}>
        <Switch checked={checked} onCheckedChange={(value) => save.mutate(value)} label="Autorizar uso do assistente" />
      </div>
    </section>
  );
}
