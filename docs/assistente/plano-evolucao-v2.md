# Plano de Evolução v2 do Assistente no SondoHub (MVP Direto e Funcional)

> **Princípio deste plano:** Começar pela implementação **mais simples, funcional, segura e direta**, aproveitando 100% do que já existe no `sondohub` (`NestJS`, `Prisma`, `@sondohub/contracts`, `AdminUsersService`, `GemeoClient`, `ExperienceClient` e o WebSocket atual), sem introduzir dependências pesadas ou quebrar o que já funciona.

---

## Visão Geral das 3 Features Escolhidas

| # | Feature | O que entrega no MVP | Esforço / Custo de Código |
| :--- | :--- | :--- | :--- |
| **1** | **Controle de Escrita com Confirmação Visual (*Human-in-the-Loop*)** | O `MASTER` pede por voz ou chat para alterar permissões/usuários (ex.: *"Libera o Gêmeo nível 2 para a Maria"*, *"Autoriza o assistente para o João"*, *"Desativa o usuário X"*). O assistente **não grava direto no banco**: ele exibe um **Card de Confirmação** com botões **Confirmar / Cancelar** no navegador e só executa se o humano clicar em Confirmar. | **Baixo (~250 linhas)**<br/>Reaproveita o protocolo `emitirComAck` já existente no WebSocket e o `AdminUsersService`. |
| **2** | **Absorção do CopilotKit (Estado Reativo + Generative UI) e Vercel AI SDK (Abstração de LLM)** | **2A.** Hook `useContextoTelaAssistente` para as páginas publicarem seu estado real (usuário aberto, filtros da tabela, período do painel).<br/>**2B.** Suporte a **Cards Visuais (Generative UI)** dentro das mensagens do `ChatAssistente.tsx` e no painel de voz.<br/>**2C.** Interface `AssistenteChatEngine` no backend para separar o chat de texto do motor de áudio e permitir trocar/escolher o LLM (`Gemini Pro/Flash`, `Groq`, `OpenAI`). | **Baixo a Médio (~350 linhas)**<br/>Zero bibliotecas pesadas; usa padrões nativos React + Adapter simples no NestJS. |
| **3** | **Assistente Federado (`SondoHub` ↔ `SondoView`, `Gêmeo`, `Experience`) estilo MCP** | Contrato leve HTTP (`GET /api/sondohub/assistant/context` ou `/query` autenticado pela mesma `X-Api-Key` que já existe no `GemeoClient` e `ExperienceClient`) para o assistente do Hub consultar resumos em tempo real dos apps filhos em nome do usuário logado. | **Médio (~200 linhas no Hub + ~80 linhas por app filho)**<br/>Reaproveita a infraestrutura server-to-server (`X-Api-Key`) do Guia 19. |

---

## Feature 1: Controle de Escrita com Confirmação Visual (Human-in-the-Loop)

### 1.1. Quais ações fazem sentido já no MVP do `SondoHub`?
Todas as ações abaixo **já possuem método pronto e testado** no `AdminUsersService` ([admin-users.service.ts](../../apps/api/src/modules/users/admin-users.service.ts)) ou no `AssistenteRepository`:
1. **Liberar ou trocar nível de um App para um usuário** (`AdminUsersService.setAppLevel(userId, slug, level)`) — já sincroniza automaticamente com o **Gêmeo Digital** e com o **Experience**!
2. **Revogar acesso a um App de um usuário** (`AdminUsersService.removeApp(userId, slug)`).
3. **Autorizar ou revogar uso do Assistente de IA para um usuário** (`AssistenteRepository.definirPermissao(userId, autorizado, masterId)`).
4. **Ativar ou desativar a conta de um usuário / trocar cargo** (`AdminUsersService.update(actorId, userId, { isActive, role })`).

### 1.2. Como vai funcionar da forma mais simples e segura (Fluxo de Ponta a Ponta)

Em vez de a IA executar a escrita diretamente durante a chamada da ferramenta, usamos um **Fluxo de Proposta + Token Assinado em Memória (ou Confirmação via ACK)**:

```
1. Master fala/digita: "Libera o Experience como Administrador para o Henrique"
2. Gemini chama tool `propor_alteracao_usuario({ usuario: "Henrique", operacao: "liberar_app", app: "experience", nivel: "1" })`
3. Backend (Executor):
   - Valida que quem pediu é `MASTER` (no servidor!).
   - Busca o usuário "Henrique" e o app "Experience" no banco (sem alterar nada).
   - Cria uma `PropostaPendente` em memória na sessão (com `propostaId`, expira em 60s) contendo os IDs exatos resolvidos.
   - Envia ao navegador via WebSocket:
     `{ type: 'acao', acao: { id: 'a1', tipo: 'confirmar_escrita', proposta: { id: 'p1', titulo: 'Liberar aplicativo', resumo: 'Liberar Experience (nível 1 - Administrador) para Henrique Santos (henrique@...)', impacto: 'Sincroniza acesso com o Experience' } } }`
   - Devolve imediatamente ao Gemini: "Proposta exibida na tela. Peça para a pessoa clicar em Confirmar no cartão."
4. Navegador (React):
   - Renderiza o `<CardConfirmacaoAssistente />` dentro do Chat (e no painel flutuante da voz).
   - Quando o Master clica em **[Confirmar]**, o front chama `POST /api/assistente/propostas/:id/confirmar` (protegido por `SessionGuard` + `MasterGuard`).
5. Backend executa `AdminUsersService.setAppLevel(...)`, registra na auditoria (`assistente_audit`) e atualiza o cache do React Query (`invalidateQueries`) para a tela atrás do chat refletir a mudança na hora!
```

> **Por que não deixar a IA confirmar por voz ("Sim, pode confirmar")?**
> Porque em segurança de agentes (*Human-in-the-Loop*), uma confirmação real de escrita exige um **evento de clique físico (`POST` HTTP autenticado)** na UI. Assim, mesmo que o modelo alucine ou sofra *prompt injection*, **nenhuma escrita no banco acontece sem o clique do Master no botão Confirmar**.

### 1.3. Arquivos a Criar/Alterar na Feature 1
- **Backend (`apps/api/src/modules/assistente/`)**:
  - `propostas.ts` *(novo, ~90 linhas)*: Guarda as propostas pendentes por usuário (TTL de 60s), resolve os nomes em IDs e executa a operação via `AdminUsersService` / `AssistenteRepository` após o clique.
  - `ferramentas.ts`: Adicionar `FERRAMENTA_PROPOR_ALTERACAO` em `FERRAMENTAS_MASTER`.
  - `acoes.ts`: Adicionar o tipo `'confirmar_escrita'` em `AcaoCliente`.
  - `assistente.controller.ts`: Adicionar rota `POST /propostas/:id/confirmar` e `POST /propostas/:id/cancelar`.
- **Frontend (`apps/hub/src/features/assistente/`)**:
  - `components/CardConfirmacao.tsx` *(novo, ~75 linhas)*: Card visual com ícone, título da operação, usuário-alvo, detalhe da mudança, botões **Confirmar** e **Cancelar**, e estado de loading/concluído.
  - `executar-acoes.ts` e `ChatAssistente.tsx`: Ao receber a ação `confirmar_escrita`, exibir o card na conversa/painel.

---

## Feature 2: Absorver o Melhor do CopilotKit e do LiveKit/Vercel AI SDK

Você não precisa instalar o pacote pesado do CopilotKit nem reescrever o backend para ter as vantagens deles. Veja **exatamente o que absorver, o que ganhamos e quanto código custa**:

### 2.1. O que absorver do CopilotKit?

#### A) Leitura Reativa de Estado (`useCopilotReadable` -> `useContextoAssistente`)
- **Como é hoje no SondoHub**: O `AssistenteBolinha.tsx` só envia `{ rota, titulo, breakpoint }`. Se você está em `/admin/usuarios/123` (vendo o perfil da Maria) e pergunta *"Quais apps ela tem?"*, o assistente não sabe quem é "ela".
- **O que vamos implementar**:
  - Um store minúsculo em `apps/hub/src/features/assistente/contexto-tela-store.ts` (~35 linhas) com um hook `usePublicarContextoAssistente(dados)`.
  - Nas 3 páginas principais do Hub, adicionamos **1 linha**:
    - Em `user-detail-page.tsx`: `usePublicarContextoAssistente({ tela: 'detalhe_usuario', usuarioVisto: { id: user.id, nome: user.name, email: user.email, cargo: user.role } })`
    - Em `users-list-page.tsx`: `usePublicarContextoAssistente({ tela: 'lista_usuarios', filtroCargo: filter, buscaDigitada: q })`
    - Em `dashboard-page.tsx`: `usePublicarContextoAssistente({ tela: 'painel_master', periodoSelecionado: period })`
- **Melhoria imediata**: O assistente passa a entender pronomes demonstrativos (*"esse usuário"*, *"libera o Gêmeo para ela"*, *"nesse período que estou vendo"*) sem você precisar repetir o nome!
- **Custo de código**: **~60 linhas no total**.

#### B) Generative UI no Chat (Renderizar Componentes Visuais nas Respostas)
- **Como é hoje**: O `MensagemChat` em `use-assistente-chat.ts` só tem `{ id, papel, texto }`. Tudo é texto puro.
- **O que vamos implementar**:
  - Estender `MensagemChat` para aceitar um campo opcional `card?: CardAssistente` (vindo de um quadro WebSocket `{ type: 'card', card: {...} }` ou `{ type: 'acao' }`).
  - Criar 3 cards visuais simples em `components/CardsAssistente.tsx`:
    1. **`CardConfirmacao`** (da Feature 1 — botões Confirmar / Cancelar).
    2. **`CardUsuario`** (mostra avatar, nome, cargo, badges dos apps e botão *"Abrir ficha"* quando o Master pergunta sobre alguém).
    3. **`CardApp`** (mostra ícone do app, nível do usuário e botão *"Abrir aplicativo"* quando a pessoa pergunta sobre seus apps).
- **Melhoria imediata**: O chat deixa de ser um "bloco de notas falado" e vira um **Copiloto Interativo** onde a resposta traz botões clicáveis e cards do próprio design system do SondoHub.
- **Custo de código**: **~120 linhas**.

### 2.2. O que absorver do Vercel AI SDK / LiveKit Agents?

#### C) Abstração de Múltiplos LLMs e Desacoplamento do Chat de Texto
- **Problema atual**: O chat de texto (`canal: 'texto'`) usa `ai.live.connect` com saída de áudio (`Modality.AUDIO`). Isso custa preço de áudio (US\$ 12/1M tokens), proíbe listas/formatação no texto e perde o histórico se o socket cair.
- **O que vamos implementar**:
  - Quando o usuário estiver no **Chat de Texto com a voz silenciada (`vozLigada === false`)** ou escolher um modelo de texto mais inteligente:
    - O backend usa uma interface simples `MotorChatTexto` (`motor-texto.ts`, ~110 linhas) que chama `ai.models.generateContentStream` (para Gemini `3.8-flash` ou `pro`) **ou** qualquer endpoint compatível com OpenAI (`Groq`, `OpenRouter`, `OpenAI`) usando `fetch` nativo!
    - O mesmo catálogo de ferramentas (`ferramentasDaSessao`) e o mesmo `AssistenteExecutor` são reutilizados sem duplicar nenhuma regra de negócio.
- **Melhoria imediata**:
  1. Você pode configurar no `.env` (ou na tela do Admin) um modelo mais inteligente para texto (ex.: `Gemini Pro`, `Llama 3.3 70B` gratuito via Groq, `GPT-4o`) mantendo o `Gemini Live` para a voz.
  2. O custo do chat de texto cai ~80%.
  3. O histórico do chat persiste na sessão do navegador e pode ser reenviado ao modelo caso a conexão reconecte.
- **Custo de código**: **~150 linhas** (sem precisar instalar dezenas de pacotes externos).

---

## Feature 3: Assistente Federado (`SondoHub` ↔ `SondoView`, `Gêmeo`, `Experience`) estilo MCP

### 3.1. Como fazer as APIs conversarem da forma mais simples e padronizada?

No protocolo **MCP (Model Context Protocol)**, um "Host" (o assistente do `SondoHub`) descobre e invoca ferramentas expostas por "Servers" remotos (`SondoView`, `Gêmeo Digital`, `Experience`).

Como o `SondoHub` **já possui comunicação servidor-a-servidor autenticada por `X-Api-Key`** com os apps filhos (veja `GemeoClient` em `apps/api/src/modules/gemeo/gemeo-client.ts` e `ExperienceClient` em `apps/api/src/modules/experience/experience-client.ts`), a forma **mais simples, rápida e segura** de implementar um "MCP HTTP Federado" no ecossistema Sondotécnica é definir **1 contrato único de rota nos apps filhos**:

```
┌──────────────────────┐        HTTP POST /api/sondohub/assistant/query        ┌──────────────────────────┐
│      SONDOHUB        │ ────────────────────────────────────────────────────▶ │  APP FILHO               │
│  (Assistente Host)   │   Headers:                                            │  • SondoView             │
│                      │     X-Api-Key: <SONDOHUB_API_KEY>                     │  • Gêmeo Digital         │
│  Ferramenta:         │     X-Hub-User-Id: <UUID do usuário logado no Hub>    │  • Experience            │
│  consultar_app_filho │   Body:                                               │                          │
│                      │     { tool: "resumo" | "buscar", args: { ... } }      │  Executa no escopo do    │
│                      │ ◀──────────────────────────────────────────────────── │  hub_user_id e devolve   │
└──────────────────────┘   Response JSON:                                      │  texto/JSON falável!     │
                           { ok: true, texto: "...", link?: "https://..." }    └──────────────────────────┘
```

### 3.2. Por que essa arquitetura é perfeita para a Sondotécnica?
1. **Reaproveita 100% da autenticação atual**: Usa o mesmo middleware `sondohubApiKeyMiddleware` (`X-Api-Key` com `timingSafeEqual`) já documentado na seção 6.2 do [Guia 19](../19-guia-integracao-app-sondotecnica.md).
2. **Respeita o escopo e permissões do usuário em cada app**:
   - Primeiro, o `SondoHub` confere no seu próprio banco se o usuário logado tem acesso ativo àquele app (`AppsRepository.listForUser(user.id)`). Se o usuário não tem acesso ao `SondoView`, o Hub nem chama a API do SondoView!
   - Segundo, o Hub envia o `hub_user_id` (e e-mail) do usuário logado. O app filho (`SondoView`, `Experience` ou `Gêmeo`) resolve o usuário local pelo `hub_user_id` e roda a consulta **exatamente com o nível de acesso e contratos daquela pessoa**.
3. **No `SondoView`, as ferramentas já estão prontas!**:
   - No `sondoview-main/backend/src/assistente/dados.ts` e `executor.ts`, todas as funções (`listarAgenciasAssistente`, `consultarAvancoAssistente`, `consultarDiarioAssistente`, `consultarCenasAssistente`) **já existem e já devolvem o texto pronto para o assistente falar**! Basta expor uma rota interna `POST /api/sondohub/assistant/query` no backend do SondoView que chama o `executarFerramenta` dele.

### 3.3. O que cada App Filho poderá responder direto no Assistente do SondoHub (MVP)

| App Filho | Perguntas que o usuário poderá fazer direto no SondoHub | O que a API do App Filho devolve |
| :--- | :--- | :--- |
| **`SondoView`** | *"Como estão minhas obras no SondoView?"*, *"Qual o avanço físico da agência X?"*, *"Teve RDO hoje?"*, *"Quantas câmeras estão online?"* | Chama `listarAgenciasAssistente` / `consultarAvancoAssistente` do próprio SondoView e devolve o resumo + link direto para abrir a tela lá. |
| **`Experience`** | *"Quais eventos estão ativos no Experience?"*, *"Como está a pesquisa de satisfação?"* | Devolve resumo de eventos/pesquisas que o `hub_user_id` pode ver no Experience. |
| **`Gêmeo Digital`** | *"Quais contratos ou ativos estão ativos no Gêmeo?"* | Devolve resumo dos contratos vinculados ao usuário na tabela `usuarios_sondohub` do Gêmeo. |

---

## Ordem Recomendada de Implementação (Em 3 Entregas Enxutas)

Para mantermos risco zero e entregas testáveis a cada passo:

### Entrega 1 — Contexto Reativo da Tela + Generative UI Base (`CopilotKit Lite`)
1. Criar `contexto-tela-store.ts` e plugar `usePublicarContextoAssistente` nas telas de Detalhe do Usuário, Lista de Usuários e Painel Master.
2. Atualizar `AssistenteBolinha.tsx` e `contexto.ts` (backend) para passar o estado vivo da página ao `ver_tela`.
3. Estender `ChatAssistente.tsx` para renderizar `CardAssistente` abaixo das bolhas de mensagem.
- **Resultado verificável**: Você abre a página de um usuário em `/admin/usuarios/:id`, pergunta *"Quais aplicativos essa pessoa tem?"* e o assistente responde sobre o usuário da tela + mostra o card visual dele.

### Entrega 2 — Controle de Escrita com Card de Confirmação (`Human-in-the-Loop`)
1. Criar `propostas.ts` no backend do `sondohub` + ferramenta `propor_alteracao_usuario` (exclusiva para `MASTER`).
2. Adicionar endpoints `POST /api/assistente/propostas/:id/confirmar` e `/cancelar` chamando `AdminUsersService` (`setAppLevel`, `removeApp`, `update`) e `AssistenteRepository.definirPermissao`.
3. Criar componente `CardConfirmacao.tsx` no frontend com feedback visual e invalidação automática do cache do React Query após confirmar.
- **Resultado verificável**: Você pede *"Libera o Experience nível 1 para o usuário X"*, o card de confirmação aparece no chat/voz, você clica em **Confirmar** e o acesso é liberado no Hub e sincronizado no Experience, com registro na auditoria.

### Entrega 3 — Assistente Federado (MCP HTTP `SondoHub` ↔ `SondoView` / Apps Filhos) + Motor de Texto Multi-LLM
1. Criar `federacao.client.ts` no módulo `assistente` do `sondohub` e a ferramenta `consultar_aplicativo` (que verifica se o usuário tem acesso ao app e faz `POST <APP_API_URL>/sondohub/assistant/query` com `X-Api-Key` e `hubUserId`).
2. No `sondoview-main`, adicionar a rota leve `/api/sondohub/assistant/query` reaproveitando o `executor.ts` que já existe lá.
3. Adicionar o adaptador `motor-texto.ts` para permitir que o chat de texto (quando sem voz) use modelos de texto mais inteligentes/baratos com histórico persistente.
- **Resultado verificável**: Direto do SondoHub, você pergunta *"Como está o avanço das minhas obras no SondoView?"*, o SondoHub consulta o SondoView em tempo real e responde com os dados e um botão para abrir o SondoView.
