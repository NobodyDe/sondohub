# Assistente de IA (voz e chat) no SondoHub: design

Portado do SondoView (referência somente leitura). Copia o núcleo genérico e reescreve a camada de domínio para o que o hub conhece: apps, acessos, perfil, sessões, painel e usuários.

## Decisões (confirmadas em 2026-11-24)

| Tema | Decisão |
| --- | --- |
| Quem usa | `MASTER` sempre. Demais usuários só com o switch "Autorizar uso do assistente", que o `MASTER` liga em `/admin/usuarios/:id`. |
| Canais | Voz (Gemini Live, vozes `Charon` masculina e `Kore` feminina) e chat de texto no mesmo WebSocket (`canal: 'texto'`). Mic aberto ou apertar-para-falar. |
| Extras | Internet (clima e pesquisa web, desligada por padrão, por usuário), regras (empresa e pessoais, com bloqueio de ferramentas), memórias, perguntas rápidas, auditoria de 90 dias. |
| Fora da v1 | Ponte do celular (QR). Ações que escrevem dados. |
| Chave do Gemini | Global (`MASTER`) e própria de cada usuário; a própria vence. AES-256-GCM com a env `ASSISTENTE_CHAVE_SECRETA`. Nunca volta ao navegador, exceto a global para o `MASTER` copiar (`no-store`). |
| Idioma / nomes | pt-BR. Produto "SondoHub". Cada pessoa dá o nome do assistente e o apelido dela. |
| Modelos | Padrões do SondoView: `GEMINI_LIVE_MODEL` (`models/gemini-3.1-flash-live-preview`) e `GEMINI_SEARCH_MODEL` (`gemini-3.8-flash`), ambos sobrescrevíveis por env. |
| Banco | Models Prisma + migration SQL em `apps/api/prisma/migrations`. Quem roda `migrate` é o dono do projeto, nunca o agente. |
| Domínio | Somente leitura: meus apps e níveis, perfil e dispositivos, painel e usuários (só `MASTER`), ações na tela (abrir app, navegar). |

## Convenções do destino que vencem as do SondoView

- API em NestJS (módulo, controller, service/repository, `SessionGuard`, `MasterGuard`, `ZodValidationPipe`), imports ESM com sufixo `.js`, arquivos em kebab-case, testes `*.spec.ts` (vitest).
- Exceção deliberada: o assistente é um porte e usa o vocabulário pt-BR do SondoView (arquivos, tipos, campos JSON, tabelas `assistente_*`, rotas `/api/assistente/...`). Assim o núcleo copiado continua comparável com a referência e o front copiado conversa com a API sem tradução. Fora do assistente, o código segue o inglês do hub. Nomes de arquivo em kebab-case (`validar-chave.ts`).
- Rotas de tela em pt-BR (`/assistente`, `/admin/assistente`).
- Contratos (zod e tipos) em `packages/contracts`. Frontend em `apps/hub/src/features/assistente`, com os primitivos de `components/ui`.
- Commits convencionais. Sem commit, sem deploy, sem aplicar SQL sem pedido.

## Arquitetura

```
Navegador ──WS /api/assistente/voice──▶ API Nest ──ai.live.connect (@google/genai)──▶ Gemini Live
 (mic PCM16 16 kHz, JSON)               (proxy, ferramentas, regras)                  (áudio PCM16 24 kHz)
```

- O hub e a API são same-origin (`/api`) e o cookie é `SameSite=Strict`, então o cookie de sessão acompanha o upgrade do WebSocket. A API autentica no upgrade com `SessionsService.validate` e confere o `Origin` contra `HUB_URL` (evita sequestro de WebSocket entre sites). Não existe token no corpo nem na URL.
- O primeiro quadro do cliente continua sendo `{type:'auth', canal:'voz'|'texto'}` (sem token) para manter o protocolo do SondoView.
- `ws` em modo `noServer`, ligado ao `upgrade` do `http.Server` que o Nest devolve (`app.getHttpServer()`), em `main.ts`. `maxPayload` 256 KB. Qualquer outro caminho: `socket.destroy()`.
- Ordem de autorização na abertura: sessão válida, usuário autorizado (`MASTER` ou switch), assistente ligado e chave resolvida (própria, depois global), canal `texto` exige `chatText`. Depois monta regras, memórias, prompt, ferramentas e abre o Gemini.

## Mapa de arquivos

### Backend: `apps/api/src/modules/assistente/`

| Arquivo | Classe | Observação |
| --- | --- | --- |
| `crypto.ts` | COPIAR | AES-256-GCM; prefixo e segredo trocados (`ASSISTENTE_CHAVE_SECRETA`). |
| `validate-key.ts`, `web-search.ts`, `weather.ts` | COPIAR | Validação da chave, pesquisa web (Gemini+Search, Google Notícias, DuckDuckGo), Open-Meteo. |
| `types.ts`, `rules.ts`, `memories.ts`, `quick-questions.ts` | COPIAR | Tipos, vozes, validação e limites (nome 40, regra 80/500, memória 300, pergunta 200, chave 200). |
| `assistente.repository.ts` | ADAPTAR | Prisma no lugar do pool SQL: config, chaves, preferências, regras, memórias, perguntas, auditoria, permissão. |
| `tools.ts`, `catalog.ts`, `executor.ts` | ADAPTAR | Genéricas (memória, internet, `ver_tela`, `acao_tela`) e de domínio do hub. |
| `domain-queries.ts` | DOMÍNIO (novo) | Chama os serviços existentes (`AppsRepository`, `SessionsService`, `UsersRepository`, `DashboardService`) e devolve texto curto e falável. |
| `prompt.ts`, `guide.ts` | ADAPTAR | Identidade SondoHub e guias por assunto (apps, perfil, painel, usuários). |
| `voice-session.ts`, `assistente.gateway.ts` | ADAPTAR | Sessão Gemini Live e anexo ao servidor HTTP. |
| `assistente.controller.ts`, `assistente-admin.controller.ts`, `assistente.module.ts` | ADAPTAR | Rotas HTTP; admin protegido por `SessionGuard` + `MasterGuard`. |
| `*.spec.ts` | COPIAR/ADAPTAR | Um spec por módulo puro, porte dos `*.test.ts` de origem. |

Fora do porte (DOMÍNIO do SondoView): `acoes`, `midia`, `mapaComandos`, `pastas`, `dados`, `resumos`, `planejamento*`, `repositorioRdo`, `guia` de obras, `ponte`.

### Contratos: `packages/contracts/src/`

Schemas zod e tipos do assistente (config, preferências, regra, memória, pergunta, auditoria, permissão), exportados pelo `index.ts`.

### Frontend: `apps/hub/src/features/assistente/`

| Peça | Classe | Observação |
| --- | --- | --- |
| `lib/pcm.ts`, `lib/mic-mode.ts`, `lib/audio-devices.ts` | COPIAR (+ testes) | Exige adicionar `vitest` ao `apps/hub` (hoje o hub não tem teste). |
| `use-assistant-voice.ts`, `use-assistant-chat.ts` | ADAPTAR | URL do WS por `location` (`ws(s)://host/api/assistente/voice`), sem token, sem empresa/ambiente. |
| `api.ts`, `use-assistant-config.ts` | ADAPTAR | Cliente HTTP (exporta `request` de `lib/api.ts`) e `useQuery`. |
| `components/AssistantBubble.tsx`, `AssistantChat.tsx` | ADAPTAR | Bolinha flutuante e chat; usa `components/ui`. |
| `components/MicModePicker.tsx`, `AudioSection.tsx`, `GeminiKeyForm.tsx` | COPIAR (UI trocada) | Primitivos do hub. |
| `components/run-actions.ts` | DOMÍNIO (novo) | Executa no navegador `navegar` e `abrir_app` (valida a ação recebida; ignora desconhecidas). |
| `pages/AssistantSettingsPage.tsx` | ADAPTAR | Pessoal: ligar, voz, internet, nome, apelido, mic, chat, chave própria, áudio. |
| `pages/AssistantRulesPage.tsx` (prop `global`), `AssistantMemoriesPage.tsx`, `AssistantQuestionsPage.tsx` | ADAPTAR | CRUDs. |
| `pages/AdminAssistantPage.tsx`, `AdminAssistantAuditPage.tsx` | ADAPTAR | Chave global, regras da empresa, auditoria. |
| `AssistantAuthorizationSwitch.tsx` | ADAPTAR | Entra em `user-detail-page.tsx`. |

Montagem: nova rota-mãe sem caminho em `main.tsx` com `<Outlet />` e `<AssistantBubble />`, para a bolinha viver dentro do router (precisa de `useNavigate`) e aparecer em todas as telas logadas (Launcher, `/perfil`, `/admin/*`). A bolinha não renderiza sem sessão, sem autorização ou com o assistente desligado, nem em `/login` e `/redefinir-senha`.

Entradas de menu: "Assistente" no menu da conta (só se autorizado) e item "Assistente" na sidebar do admin.

## Banco (Prisma, tabelas próprias; nenhuma tabela de negócio é alterada)

Todas ligadas a `users(id)` por UUID com `onDelete: Cascade`, exceto `assistente_config` (linha única).

| Tabela | Conteúdo |
| --- | --- |
| `assistente_config` | `id = 1`, `api_key_enc`, `updated_by`, `updated_at`. |
| `assistente_user_keys` | `user_id` PK, `api_key_enc`. |
| `assistente_preferences` | `user_id` PK, `enabled`, `voice` (`Charon`\|`Kore`), `internet`, `name`, `nickname`, `mic_mode` (`open`\|`push`), `chat_text`, `preference` (`voice`\|`text`). |
| `assistente_permissions` | `user_id` PK, `authorized`, `updated_by`, `updated_at`. Tabela própria porque `users` é de negócio e não leva coluna nova. |
| `assistente_rules` | `user_id` nulo = regra da empresa; `name`, `text`, `active`, `blocks` (json com nomes de ferramentas). |
| `assistente_memories` | `user_id`, `text`, `origin` (`user`\|`assistant`), `active`. |
| `assistente_quick_questions` | `user_id`, `text`, `active`. |
| `assistente_audit` | `user_id`, `tool`, `arguments`, `result`, `blocked`, `created_at` (retenção de 90 dias, limpeza na consulta). |

A migration SQL é gerada offline (`prisma migrate diff` entre o schema antigo e o novo), revisada e só então aplicada por quem é dono do banco.

## Rotas HTTP (`/api/assistente`, todas com `SessionGuard`)

Como no protocolo do SondoView, com `/admin/*` exigindo `MasterGuard`: `GET /config`, `PUT /preferences`, `GET|PUT /own-key`, `POST /validate-key`, CRUD de `/rules`, `/memories`, `/questions`. Administração: `PUT /admin/key`, `GET /admin/key`, CRUD de `/admin/rules`, `GET /admin/audit`, `GET|PUT /admin/users/:id/permission`. WS: `/api/assistente/voice`.

## Ferramentas de domínio (v1, somente leitura)

| Ferramenta | Quem | Chama |
| --- | --- | --- |
| `listar_meus_apps` | todos | `AppsRepository.listForUser` |
| `meu_perfil` | todos | `UsersRepository.findProfile` + `SessionsService.listActive` (dispositivos) |
| `resumo_painel` (período) | `MASTER` | `DashboardService.get` |
| `resumo_usuarios`, `buscar_usuarios`, `detalhe_usuario` | `MASTER` | `UsersRepository.summary`, `listPage`, `findDetail` |
| `acao_tela` (`navegar`, `abrir_app`) e `ver_tela` | todos (rotas `/admin/*` só `MASTER`) | Emite `acao` ao navegador e espera `acao_resultado`. |
| `lembrar`, `esquecer`, `listar_memorias`, `previsao_tempo`, `pesquisar_web` | todos (internet só se ligada) | Genéricas. |

O papel (`MASTER`) é checado no servidor no executor, não só escondido no catálogo. Resultado passa por `carimbarRegras`, auditoria e bloqueio por regra antes de voltar ao modelo. Nunca devolve `passwordHash`, tokens ou o hash de sessão.

## Riscos e pendências

1. O modelo Live (`gemini-3.1-flash-live-preview`) é preview: confirmar o vigente antes de fixar; fica em env.
2. Proxy: produção tem dois nginx (host e container do hub). Os dois precisam de `proxy_http_version 1.1`, `Upgrade`, `Connection` e `proxy_read_timeout` alto. Eu altero só os arquivos em `deploy/nginx/`; o deploy é do dono.
3. Microfone exige HTTPS (produção já tem; `localhost` serve no dev).
4. `ASSISTENTE_CHAVE_SECRETA` opcional: sem ela o assistente responde 503 e o resto da API sobe normalmente.
5. `apps/hub` não tem testes: adicionar `vitest` só para os módulos puros copiados.
6. Escopo de dados: o assistente herda o escopo do usuário da sessão. Teste com usuário comum, não só `MASTER`.
7. As specs de origem do SondoView não vieram no download; o porte segue o código e as referências da skill.
