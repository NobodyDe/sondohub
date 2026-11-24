import { assistenteApi } from "../api.ts";
import AssistentePageShell from "../components/AssistentePageShell.tsx";
import TextListEditor from "../components/TextListEditor.tsx";

export function AssistenteMemoriasPage() {
  return (
    <AssistentePageShell
      title="Memórias"
      description="O que o assistente deve lembrar sobre você em todas as conversas. Ele também guarda sozinho quando você pede."
      back={{ to: "/assistente", label: "Assistente" }}
    >
      <TextListEditor
        queryKey={["assistente", "memorias"]}
        list={assistenteApi.memorias}
        create={assistenteApi.criarMemoria}
        edit={assistenteApi.editarMemoria}
        remove={assistenteApi.removerMemoria}
        maxItems={50}
        maxLength={300}
        label="Ex.: prefiro respostas curtas"
        empty="Nenhuma memória ainda."
      />
    </AssistentePageShell>
  );
}
