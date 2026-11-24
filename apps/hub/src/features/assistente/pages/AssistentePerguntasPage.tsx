import { assistenteApi } from "../api.ts";
import AssistentePageShell from "../components/AssistentePageShell.tsx";
import TextListEditor from "../components/TextListEditor.tsx";

export function AssistentePerguntasPage() {
  return (
    <AssistentePageShell
      title="Perguntas rápidas"
      description="Atalhos que aparecem como botões no chat do assistente."
      back={{ to: "/assistente", label: "Assistente" }}
    >
      <TextListEditor
        queryKey={["assistente", "perguntas"]}
        list={assistenteApi.perguntas}
        create={assistenteApi.criarPergunta}
        edit={assistenteApi.editarPergunta}
        remove={assistenteApi.removerPergunta}
        maxItems={12}
        maxLength={200}
        label="Ex.: quais aplicativos eu tenho?"
        empty="Nenhuma pergunta rápida ainda."
      />
    </AssistentePageShell>
  );
}
