import SettingsRow from "@/features/user/components/SettingsRow.tsx";
import NavLinkRow from "../components/NavLinkRow.tsx";
import GeminiKeyForm from "../components/GeminiKeyForm.tsx";
import { useAssistenteConfig } from "../use-assistente-config.ts";

/** Administração do assistente (só Master, dentro do /admin): chave da empresa, regras da empresa e auditoria. */
export function AdminAssistentePage() {
  const config = useAssistenteConfig();

  if (config.isError) return <p className="text-danger-text">Não foi possível carregar. Recarregue a página.</p>;
  if (!config.data) return <p className="text-muted-foreground">Carregando…</p>;

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Assistente de IA</h1>
        <p className="text-sm text-muted-foreground">
          Configuração da empresa. Quem libera o uso para cada pessoa é a tela do usuário, em Usuários.
        </p>
      </header>

      <div>
        <SettingsRow
          title="Chave do Gemini da empresa"
          description="Vale para quem não tem chave própria. Fica criptografada no servidor; você pode copiá-la daqui."
        >
          <GeminiKeyForm scope="global" configured={config.data.chaveConfigurada} />
        </SettingsRow>

        <SettingsRow title="Regras e auditoria" description="Regras valem para todos. A auditoria guarda as chamadas de ferramenta por 90 dias.">
          <nav className="flex flex-col gap-2" aria-label="Administração do assistente">
            <NavLinkRow to="/admin/assistente/regras" label="Regras da empresa" hint="O que o assistente não pode falar para ninguém" />
            <NavLinkRow to="/admin/assistente/auditoria" label="Auditoria" hint="O que o assistente consultou" />
            <NavLinkRow to="/assistente" label="Minhas configurações" hint="Voz, nome, microfone, regras e memórias pessoais" />
          </nav>
        </SettingsRow>
      </div>
    </div>
  );
}
