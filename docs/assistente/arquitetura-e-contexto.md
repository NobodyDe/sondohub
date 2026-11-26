# Arquitetura, Funcionamento e Evolução do Assistente de IA (SondoView & SondoHub)

> **Propósito deste documento:** Servir como referência arquitetural completa e documento de contexto para manutenção, evolução e porte do sistema de Assistente de IA (voz em tempo real e chat de texto) da Sondotécnica entre projetos (`SondoView`, `SondoHub` e aplicações filhas como `Gêmeo Digital` e `Experience`).

---

## 1. Visão Geral: Como o Sistema Foi Construído (`SondoView` vs. `SondoHub`)

O sistema foi projetado separando um **Núcleo Genérico** (captura e reprodução de áudio PCM, proxy WebSocket, sessão Gemini Live, criptografia de chaves de API, regras, memórias, perguntas rápidas, busca na internet e auditoria) de uma **Camada de Domínio** (as ferramentas de consulta e ações de interface específicas de cada aplicação).

| Camada | `sondoview-main` (Origem) | `sondohub` (Porte Implementado) |
| :--- | :--- | :--- |
| **Stack Backend** | Node.js + Express + SQL puro (`pg`) em `backend/src/assistente/` | NestJS + Prisma + Zod (`@sondohub/contracts`) em `apps/api/src/modules/assistente/` |
| **Stack Frontend** | React + Vite + Web Audio API (`AudioWorklet`) em `frontend/src/hooks/useAssistenteVoz.ts` | React + Vite + TanStack Query em `apps/hub/src/features/assistente/` |
| **Autenticação WS** | Token JWT enviado no 1º quadro JSON (`{type: 'auth', token}`) | Cookie `SameSite=Strict` validado no handshake HTTP `Upgrade` + verificação de `Origin` (`assistente.gateway.ts`) |
| **Domínio de Negócio** | Obras, Agências, Modais, EAP, Curva S, RDO/RDF, Câmeras ao vivo, Drive de Anexos e Mapa 3D/4D/Globo | Portal SSO/Launcher: Meus Apps e níveis, Perfil/Dispositivos conectados, Painel Master e Gestão de Usuários |
| **Ponte de Celular** | Sim (`ponte.ts`): pareia celular via QR Code para usar o celular como microfone/alto-falante sem fio do PC | Fora da v1 do Hub |

---

## 2. Motor de IA (LLM), Chaves de API, Alternativas e Controle da Aplicação

### 2.1. Qual o motor e qual LLM roda por trás?
O motor utiliza o SDK oficial **`@google/genai`** (API `v1beta`) operando com dois modelos configuráveis via variáveis de ambiente:

1. **Motor Principal (Voz e Chat em Tempo Real) — `Gemini Live API` (`ai.live.connect`)**:
   - **Modelo padrão**: `models/gemini-3.1-flash-live-preview` (configurável via `GEMINI_LIVE_MODEL`).
   - **Como funciona**: Diferente de assistentes tradicionais que encadeiam 3 serviços separados (*Speech-to-Text* -> *LLM de texto* -> *Text-to-Speech*), o **Gemini Live é um modelo multimodal nativo Speech-to-Speech (Áudio-para-Áudio)** via WebSocket bidirecional (`BidiGenerateContent`).
   - Ele recebe diretamente o áudio PCM16 mono em `16 kHz` e devolve diretamente a voz sintetizada em PCM16 `24 kHz` (vozes `Charon` masculina ou `Kore` feminina), emitindo em paralelo as transcrições (`inputAudioTranscription` e `outputAudioTranscription`) que alimentam as legendas em tempo real e o chat de texto.
   - **Funcionamento atual do Chat de Texto (`canal: 'texto'`)**: Na v1, o chat digitado abre uma sessão no mesmo `Gemini Live` com `responseModalities: [Modality.AUDIO]`. O texto digitado é enviado via `sessao.sendRealtimeInput({ text })`, a transcrição de saída (`outputAudioTranscription`) é exibida nos balões do chat e o áudio gerado é reproduzido (ou silenciado no navegador).

2. **Motor Secundário (Pesquisa Web) — `ai.models.generateContent`**:
   - **Modelo padrão**: `gemini-3.8-flash` (configurável via `GEMINI_SEARCH_MODEL` em `busca.ts`).
   - Acionado apenas pela ferramenta `pesquisar_web`. Tenta usar o Grounding oficial do Google Search (`tools: [{ googleSearch: {} }]`); caso a chave não possua faturamento habilitado para Search Grounding, executa fallback automático e gratuito para o **RSS do Google Notícias** e para busca HTML no **DuckDuckGo**.
   - A ferramenta `previsao_tempo` (`clima.ts`) utiliza a API pública **Open-Meteo** (geocoding + forecast), sem necessidade de chave de API.

### 2.2. Gestão e Segurança de Chaves de API (BYOK)
- O sistema suporta **Chave Global** (cadastrada pelo Administrador/Master em `assistente_config`) e **Chave Própria por Usuário** (`assistente_user_keys`), onde a chave própria tem precedência sobre a global.
- Todas as chaves são criptografadas em repouso no banco com **AES-256-GCM** (`cripto.ts`), derivando a chave criptográfica do segredo de ambiente (`ASSISTENTE_SEGREDO` / `ASSISTENTE_CHAVE_SECRETA`).
- A chave nunca é enviada ao navegador durante o uso: o backend atua como proxy autenticado.

### 2.3. Opções de LLMs Mais Inteligentes, Uso Free e Voz por Chave de API
1. **Free Tier Nativo (Google AI Studio)**:
   - Chaves geradas gratuitamente no Google AI Studio possuem camada gratuita (Free Tier) para a Gemini Live API e para os modelos Flash. Como cada usuário pode cadastrar sua própria chave nas configurações do assistente, é possível operar a custo zero para testes ou equipes pequenas dentro dos limites de RPM/RPD do tier gratuito.
2. **Desacoplamento do Chat de Texto para Modelos `Pro` ou Multi-LLM**:
   - Para consultas complexas no chat de texto (quando a voz está silenciada), pode-se rotear a conversa para `generateContentStream` com modelos de raciocínio avançado (`gemini-2.5-pro` / `gemini-3.1-pro`, `Claude Sonnet`, `GPT-4o`, ou modelos gratuitos via API key na **Groq** / **OpenRouter** como `Llama 3.3 70B`, `DeepSeek R1`, `Qwen 3`).
3. **Alternativas para Voz**:
   - **Gemini Live API** (atual): Melhor relação custo-benefício e latência nativa Speech-to-Speech.
   - **OpenAI Realtime API (`gpt-4o-realtime-preview`)**: Altíssima inteligência em Speech-to-Speech, porém sem Free Tier e custo ~6x a 10x maior.
   - **Pipeline Modular (STT + LLM + TTS)**: `Groq Whisper Large v3 Turbo` (STT ultra-rápido com free tier) + Qualquer LLM Pro + `Web Speech API / Edge TTS / Kokoro / Cartesia / ElevenLabs`.

---

## 3. Como o Assistente Sabe das Informações, Lê a Tela e Controla a Aplicação

O assistente **não lê o DOM/HTML bruto** e **não executa queries SQL geradas por IA**. Ele opera através de 3 mecanismos determinísticos e auditados:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ NAVEGADOR (React)                                                          │
│                                                                            │
│ 1. Mudou de rota/filtro? ──(debounce 300ms)──▶ envia {type: 'contexto'}    │
│ 2. Recebeu {type: 'acao'}? ──▶ executa no React Router / Contextos / Mapa  │
│                            ──▶ devolve {type: 'acao_resultado', id, ok}    │
└───────────────▲───────────────────────────────────────────┬────────────────┘
                │ WebSocket (/api/assistente/voz)           │
┌───────────────┴───────────────────────────────────────────▼────────────────┐
│ BACKEND (Node / NestJS)                                                    │
│                                                                            │
│ • Guarda último snapshot em `contextoTela` (lido pela tool `ver_tela`)     │
│ • Executa tools de dados chamando os mesmos Services/Repositories da API   │
│   sempre filtrando pelo `user.id` / `role` da sessão                       │
│ • Emite ações para o navegador via `emitirComAck` (timeout 4s)             │
│ • Aplica bloqueio de regras + registra auditoria em `assistente_audit`     │
└───────────────▲───────────────────────────────────────────┬────────────────┘
                │ Tool Call (FunctionCall)                  │ Tool Response
┌───────────────┴───────────────────────────────────────────▼────────────────┐
│ GEMINI LIVE API (Google Cloud)                                             │
│ • Recebe System Prompt + Guias + Memórias + Regras + Declarações de Tools  │
└────────────────────────────────────────────────────────────────────────────┘
```

### 3.1. Leitura de Dados do Sistema (Ferramentas de Domínio)
- O backend declara funções tipadas (`FunctionDeclaration`) em `ferramentas.ts` e injeta um manual de instruções (`guia.ts`) no System Prompt (`prompt.ts`).
- Quando o usuário faz uma pergunta de negócio, o modelo emite um `toolCall`.
- O `executor.ts` valida no servidor:
  1. Se a ferramenta não foi bloqueada por uma regra ativa da empresa ou pessoal (`ferramentasBloqueadas`).
  2. Se o cargo do usuário permite chamá-la (ex.: `NOMES_SO_MASTER` no SondoHub exige `ctx.user.role === 'MASTER'`).
- Em seguida, chama os serviços reais da aplicação (`AppsRepository`, `UsersRepository`, `SessionsService`, `DashboardService` no SondoHub; `avanco`, `cenas`, `anexos`, `planejamento` no SondoView).
- **Cálculo determinístico no código**: Os serviços em `consultas.ts` / `dados.ts` fazem todas as contas, variações percentuais e rankings em TypeScript e entregam texto ou JSON enxuto já calculado (`// O modelo não faz conta`), eliminando alucinações numéricas.
- Antes de devolver o resultado ao Gemini, o servidor aplica `carimbarRegras(resultado, regrasSessao)` (para garantir que o modelo não narre conteúdos proibidos por regra) e grava o log na tabela `assistente_audit` (retenção de 90 dias).

### 3.2. Como Ele Lê a Tela Atual (`ver_tela`)
- O componente `AssistenteBolinha.tsx` monitora o estado do frontend via `useEffect` com debounce de `300ms`.
- Sempre que a rota ou os filtros mudam, o navegador envia pelo WebSocket: `{ type: 'contexto', contexto: { rota, titulo, breakpoint, recorte, mapa, midia } }`.
- O backend sanitiza esse payload em `contexto.ts` (remove chaves sensíveis como `token|senha|auth|chave`, trunca strings em 120 caracteres e limita o JSON a `4 KB`) e armazena em memória na sessão (`contextoTela`).
- Quando o usuário diz *"o que estou vendo aqui?"* ou *"filtra esse item"*, o modelo invoca a ferramenta `ver_tela`, que retorna o snapshot instantaneamente.

### 3.3. Como Ele Controla a Aplicação (`acao_tela` + Protocolo ACK)
- Quando o usuário pede para navegar, abrir um app, filtrar ou controlar o mapa, o modelo chama `acao_tela` (ou `abrir_midia` / `controlar_mapa`).
- O módulo `acoes.ts` traduz nomes falados em rotas válidas ou slugs/IDs que o usuário tem permissão de acessar.
- O backend chama `emitirComAck(acao)`:
  1. Atribui um ID único (`a1`, `a2`...) e envia `{ type: 'acao', acao: { id: 'a1', ... } }` pelo WebSocket ao navegador.
  2. Aguarda até **4 segundos** (`PRAZO_ACK_MS = 4_000`) pela resposta `{ type: 'acao_resultado', id: 'a1', ok: true, detalhe }`.
- O navegador valida a ação em `executar-acoes.ts`, executa a navegação (`useNavigate`) ou alteração de estado e devolve o `acao_resultado`.
- O modelo só confirma ao usuário que a tela mudou depois que o navegador confirma a execução via ACK.

---

## 4. Funcionamento do WebSocket e Fluxo de Áudio em Tempo Real

### 4.1. O que é o WebSocket neste contexto?
Diferente do HTTP REST (onde cada pergunta abre e fecha uma requisição unidirecional), o **WebSocket (`ws://` / `wss://`)** inicia como um handshake HTTP `Upgrade` (`HTTP 101 Switching Protocols`) e mantém um túnel TCP **bidirecional permanente (full-duplex)** entre o navegador e o backend, que por sua vez mantém outro túnel WebSocket aberto com o Google Gemini Live.

### 4.2. Protocolo Multiplexado (Binário + JSON no mesmo socket)
A rota `/api/assistente/voz` trafega dois tipos de quadros na mesma conexão:

1. **Quadros Binários (`ArrayBuffer` / `Buffer`) — Áudio PCM16 Puro**:
   - **Subida (Cliente -> Servidor)**: O navegador captura o microfone usando um `AudioWorkletProcessor` (`MicAssistente`) em uma thread dedicada de áudio (blocos de `2048` amostras `Float32`), reduz a taxa de amostragem (`48 kHz` -> `16 kHz`) tirando a média de cada bloco (`reduzirTaxa` em `pcm.ts`) e envia bytes `Int16Array` (PCM16 little-endian mono 16 kHz).
   - **Descida (Servidor -> Cliente)**: O Gemini Live devolve fatias de áudio base64 em `24 kHz`. O backend decodifica para `Buffer` binário e envia ao navegador. O frontend converte `PCM16 -> Float32` (`pcm16ParaFloat`) e agenda cada fatia em sequência contínua (`tocaAteRef.current = inicio + buf.duration`, com folga inicial de `80ms` contra jitter) usando `AudioBufferSourceNode`.
2. **Quadros de Texto (JSON) — Eventos de Controle**:
   - **Cliente -> Servidor**:
     - `{ type: 'auth', canal: 'voz' | 'texto' }`: Inicializa a sessão.
     - `{ type: 'audio_end' }`: Indica que o usuário soltou o botão no modo *Push-to-Talk* ("Segurar para falar" ou barra de espaço).
     - `{ type: 'texto', text: '...' }`: Mensagem digitada no chat.
     - `{ type: 'contexto', contexto: {...} }`: Snapshot do estado atual da tela.
     - `{ type: 'acao_resultado', id: 'a1', ok: true, detalhe?: '...' }`: Confirmação (ACK) de ação executada no navegador.
   - **Servidor -> Cliente**:
     - `{ type: 'ready' }` / `{ type: 'live' }`: Sessão autorizada / Gemini conectado (libera captura do microfone).
     - `{ type: 'user', text: '...' }` / `{ type: 'assistente', text: '...' }`: Transcrição parcial em tempo real do usuário e do assistente.
     - `{ type: 'turn' }`: Fim do turno de fala do assistente.
     - `{ type: 'interrupted' }`: **Barge-In** (usuário falou por cima do assistente; o navegador cancela imediatamente todos os buffers de áudio agendados com `pararSaida()`).
     - `{ type: 'acao', acao: { id: 'a1', ... } }`: Comando para o navegador executar na UI.
     - `{ type: 'error', text: '...' }`: Erro fatal ou de permissão; encerra a sessão.

---

## 5. Comparativo com Projetos Open-Source Validados pelo Mercado

O código atual foi desenvolvido **sob medida (in-house)** para a Sondotécnica (com inspiração na camada de áudio do exemplo oficial `google-gemini/multimodal-live-api-web-console`, porém adicionando proxy seguro no backend, autenticação, regras, memórias e ferramentas).

Os projetos open-source validados pela comunidade e empresas que resolvem problemas equivalentes são:

1. **CopilotKit (`CopilotKit/CopilotKit` — ~28k+ stars, MIT, TypeScript/React)**:
   - Principal framework open-source para **In-App AI Copilots**.
   - Equivalência direta com o assistente Sondotécnica: `useCopilotReadable` equivale ao `ver_tela` (porém granular e reativo por componente), `useCopilotAction` equivale ao `acao_tela`, e adiciona **Generative UI** (renderizar cards interativos, tabelas e botões de confirmação diretamente dentro do fluxo do chat) via protocolo **AG-UI**.
2. **LiveKit Agents (`livekit/agents` — Apache 2.0, Node.js & Python)**:
   - Infraestrutura enterprise de agentes de voz em tempo real sobre WebRTC (usada pela OpenAI no modo de voz do ChatGPT). Possui plugin oficial para `Gemini Live API`, `OpenAI Realtime` e pipelines `STT -> LLM -> TTS`.
3. **Pipecat (`pipecat-ai/pipecat` — Daily.co, BSD-2, Python)**:
   - Framework modular baseado em frames para pipelines de voz e multimodais em tempo real, permitindo trocar provedores de LLM/STT/TTS sem alterar a aplicação cliente.
4. **Vercel AI SDK (`vercel/ai`) + `assistant-ui` (`assistant-ui/assistant-ui`)**:
   - O Vercel AI SDK é o padrão TypeScript para abstração de múltiplos LLMs (`streamText`, `generateText`, `tool`) compatível com Gemini, OpenAI, Anthropic, Groq e OpenRouter. O `assistant-ui` fornece primitivos React para interfaces de chat com suporte a Generative UI.

---

## 6. Custos Operacionais Estimados (Gemini API)

O Gemini Live contabiliza áudio a uma taxa fixa de **25 tokens por segundo** (`1.500 tokens/minuto`):

- **Free Tier (Google AI Studio)**: **R\$ 0,00** (dentro dos limites de requisição do tier gratuito; ideal para desenvolvimento ou uso com chave individual por usuário).
- **Paid Tier (Google Cloud / AI Studio Pay-as-you-go)**:
  - **Áudio Input (usuário falando)**: ~US\$ 3,00 / 1M tokens (~US\$ 0,0045/min).
  - **Áudio Output (assistente falando)**: ~US\$ 12,00 / 1M tokens (~US\$ 0,018/min).
  - **Minuto médio de conversa ativa (50% ouvindo / 50% falando)**: **~US\$ 0,012 a US\$ 0,02 / minuto** (~R\$ 0,07 a R\$ 0,11/min).
  - **Chat de Texto (quando desacoplado do áudio para modelo de texto Flash)**: **< US\$ 0,0005 por mensagem** (redução de ~80% de custo em relação a rodar o chat de texto sobre o motor de áudio).
  - **Clima e Pesquisa Web (com fallback RSS Google Notícias + DuckDuckGo + Open-Meteo)**: **R\$ 0,00**.
