import type { AssistenteConfigResposta } from "@sondohub/contracts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import Switch from "@/components/Switch.tsx";
import { Input } from "@/components/ui/input.tsx";
import SettingsRow from "@/features/user/components/SettingsRow.tsx";
import { assistenteApi, type AssistenteAlteracao } from "../api.ts";
import AssistentePageShell from "../components/AssistentePageShell.tsx";
import AudioSection from "../components/AudioSection.tsx";
import GeminiKeyForm from "../components/GeminiKeyForm.tsx";
import MicModePicker from "../components/MicModePicker.tsx";
import NavLinkRow from "../components/NavLinkRow.tsx";
import Segmented from "../components/Segmented.tsx";
import { errorMessage } from "../error-message.ts";
import { useAssistenteConfig, useAtualizarConfigAssistente } from "../use-assistente-config.ts";

const MAX_NAME = 40;

export function AssistenteSettingsPage() {
  return (
    <AssistentePageShell
      title="Assistente de IA"
      description="Converse por voz ou texto para consultar seus aplicativos e a sua conta."
      back={{ to: "/", label: "Aplicativos" }}
    >
      <Settings />
    </AssistentePageShell>
  );
}

function Settings() {
  const config = useAssistenteConfig().data;
  const updateConfig = useAtualizarConfigAssistente();
  const save = useMutation({
    mutationFn: assistenteApi.salvarPreferencias,
    onSuccess: updateConfig,
  });
  if (!config) return null;

  const hasKey = config.chaveConfigurada || config.chavePropriaConfigurada;
  const change = (alteracao: AssistenteAlteracao) => save.mutate(alteracao);

  return (
    <div>
      {save.isError && (
        <p role="alert" className="pb-4 text-sm font-semibold text-danger-text">
          {errorMessage(save.error)}
        </p>
      )}

      <SettingsRow
        title="Ligar o assistente"
        description={hasKey ? "A bolinha do assistente aparece nas telas do SondoHub." : "Precisa de uma chave do Gemini: a da empresa ou a sua, logo abaixo."}
      >
        <Switch checked={config.habilitadoConfig} onCheckedChange={(habilitado) => change({ habilitado })} label="Ligar o assistente" />
      </SettingsRow>

      <SettingsRow title="Voz" description="Voz com que o assistente fala.">
        <Segmented
          label="Voz"
          value={config.voz}
          options={[
            { value: "Charon", label: "Masculina (Charon)" },
            { value: "Kore", label: "Feminina (Kore)" },
          ]}
          onChange={(voz) => change({ voz })}
        />
      </SettingsRow>

      <SettingsRow title="Nome e apelido" description="Como você chama o assistente e como ele chama você. Vazio: ele pergunta o nome e usa seu primeiro nome.">
        <NamesForm key={`${config.nome}|${config.apelido}`} config={config} onSave={change} saving={save.isPending} />
      </SettingsRow>

      <SettingsRow title="Microfone" description="Aberto: ele escuta o tempo todo e você pode interromper. Apertar: só ouve enquanto você segura o botão.">
        <MicModePicker value={config.modoMic} onChange={(modoMic) => change({ modoMic })} />
      </SettingsRow>

      <SettingsRow title="Chat de texto" description="Conversar digitando. A resposta também é falada, e você pode silenciar.">
        <div className="flex flex-col gap-3">
          <Switch checked={config.chatTexto} onCheckedChange={(chatTexto) => change({ chatTexto })} label="Chat de texto" />
          {config.chatTexto && (
            <Segmented
              label="O que abre ao tocar na bolinha"
              value={config.preferencia}
              options={[
                { value: "voz", label: "Abrir a voz" },
                { value: "texto", label: "Abrir o chat" },
              ]}
              onChange={(preferencia) => change({ preferencia })}
            />
          )}
        </div>
      </SettingsRow>

      <SettingsRow title="Internet" description="Deixa o assistente consultar previsão do tempo e pesquisar na web.">
        <Switch checked={config.internet} onCheckedChange={(internet) => change({ internet })} label="Internet" />
      </SettingsRow>

      <SettingsRow
        title="Minha chave do Gemini"
        description={config.chaveConfigurada ? "Opcional: a empresa já tem uma chave. A sua, se houver, vale no lugar dela." : "Cole a sua chave de API do Gemini."}
      >
        <GeminiKeyForm scope="propria" configured={config.chavePropriaConfigurada} />
      </SettingsRow>

      <SettingsRow title="Áudio" description="Microfone e saída usados na conversa por voz.">
        <AudioSection />
      </SettingsRow>

      <SettingsRow title="Personalizar" description="Ensine o assistente o que falar e o que lembrar.">
        <nav className="flex flex-col gap-2" aria-label="Personalização">
          <NavLinkRow to="/assistente/regras" label="Regras" hint="O que ele pode e não pode falar" />
          <NavLinkRow to="/assistente/memorias" label="Memórias" hint="O que ele deve lembrar de você" />
          <NavLinkRow to="/assistente/perguntas" label="Perguntas rápidas" hint="Atalhos do chat" />
        </nav>
      </SettingsRow>
    </div>
  );
}

function NamesForm({
  config,
  onSave,
  saving,
}: {
  config: AssistenteConfigResposta;
  onSave: (alteracao: AssistenteAlteracao) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(config.nome);
  const [nickname, setNickname] = useState(config.apelido);
  const dirty = name.trim() !== config.nome || nickname.trim() !== config.apelido;

  return (
    <form
      noValidate
      className="flex flex-wrap items-end gap-2.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ nome: name, apelido: nickname });
      }}
    >
      <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold">
        Nome do assistente
        <Input value={name} maxLength={MAX_NAME} onChange={(event) => setName(event.target.value)} className="h-11 rounded-[10px] bg-background" />
      </label>
      <label className="flex flex-[1_1_180px] flex-col gap-1.5 text-sm font-semibold">
        Como ele chama você
        <Input value={nickname} maxLength={MAX_NAME} onChange={(event) => setNickname(event.target.value)} className="h-11 rounded-[10px] bg-background" />
      </label>
      <button
        type="submit"
        disabled={!dirty || saving}
        className="h-11 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        Salvar
      </button>
    </form>
  );
}
