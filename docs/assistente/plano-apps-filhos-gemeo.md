# Plano de Implementação nos Apps Filhos (Iniciando pelo Gêmeo Digital)

> **Objetivo:** Definir exatamente o que precisa ser feito em cada aplicativo filho (`Gêmeo Digital`, `Experience` e `SondoView`) para responder às consultas em tempo real do Assistente Federado do `SondoHub`, qual o custo de código e o passo a passo completo para começar pelo **Gêmeo Digital (`gemeo-digital`)**.

---

## 1. Visão Geral: O Que um App Filho Precisa Ter?

Como o `SondoHub` já faz todo o trabalho pesado (voz em tempo real com Gemini Live, autenticação da sessão do usuário, verificação se o usuário tem acesso ao app filho, regras da empresa e auditoria), **o app filho NÃO precisa ter Gemini, não precisa de WebSocket e não precisa de chave da Google**.

Cada app filho precisa apenas expor **1 rota HTTP interna servidor-a-servidor**:

```http
POST /sondohub/assistant/query
Header: X-Api-Key: <SONDOHUB_API_KEY>
```

### Comparativo de Esforço e Custo de Código por App Filho

| App Filho | Repositório do Backend | Já tem rota `/sondohub/*` com `X-Api-Key`? | O que precisa fazer | Custo de Código | Custo Financeiro / IA |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Gêmeo Digital** *(Primeiro)* | `gemeo-digital` (`https://gds-techlab.sondotecnica.com`) | **Sim!** Já tem `PUT / DELETE /sondohub/users/:id` e a tabela `usuarios_sondohub` (Aulas 14 e 17). | Criar 1 controller/service (~90 linhas) que lê os contratos, sensores e modelos BIM do `hubUserId` e devolve um resumo falável em `POST /sondohub/assistant/query`. | **~90 a 110 linhas** (1 arquivo novo + 1 linha no router) | **R\$ 0,00** (consulta SQL direta no banco do Gêmeo; quem fala é o Gemini do Hub) |
| **2. Experience** | `api-admin-experience` | **Sim!** Já tem `sondohubApiKeyMiddleware` e a coluna `hub_user_id` em `app_experience.usuarios` (Doc 18 e Guia 19). | Adicionar `POST /api/sondohub/assistant/query` protegido pelo `sondohubApiKeyMiddleware` já existente, consultando eventos ativos e pesquisas. | **~80 linhas** (1 método no controller + query SQL) | **R\$ 0,00** |
| **3. SondoView** | `sondoview-main/backend` | Não tem o guard `X-Api-Key` ainda, mas **já tem todas as ferramentas do assistente prontas** (`listarAgenciasAssistente`, `consultarAvancoAssistente`, `consultarDiarioAssistente`, `consultarCenasAssistente`). | Criar o middleware `X-Api-Key` (~15 linhas) e a rota `POST /api/sondohub/assistant/query` (~45 linhas) chamando as funções de `src/assistente/dados.ts` que já existem! | **~60 linhas** | **R\$ 0,00** |

---

## 2. Plano Detalhado para Começar pelo Gêmeo Digital (`gemeo-digital`)

### 2.1. O Que Já Existe Hoje entre `SondoHub` e `Gêmeo Digital`
Pelos documentos `07b`, `14` e `17` e pelo módulo `apps/api/src/modules/gemeo/gemeo-client.ts`:
1. **No `SondoHub` (Já pronto e testado!)**:
   - Variável no `.env` do Hub: `GDS_APY_KEY` (a mesma chave que o `GemeoClient` já envia no header `x-api-key`).
   - URL padrão no `AssistenteFederacaoService`: `https://gds-techlab.sondotecnica.com` (ou `GEMEO_API_URL` se quiser apontar para `http://localhost:<PORT>` em dev).
   - Quando alguém pergunta no assistente do Hub *"O que eu tenho no Gêmeo Digital?"* ou *"Quantos sensores estão online no Gêmeo?"*, o `SondoHub` já chama:
     `POST https://gds-techlab.sondotecnica.com/sondohub/assistant/query`
     enviando `x-api-key: env.GDS_APY_KEY` e o JSON:
     ```json
     {
       "hubUserId": "<UUID do usuário no Hub>",
       "email": "usuario@sondotecnica.com.br",
       "name": "Nome",
       "level": 3,
       "levelLabel": "Master",
       "query": "Quantos sensores estão online no Gêmeo?"
     }
     ```
2. **No `gemeo-digital` (O que já está lá)**:
   - O Nginx da VM já encaminha tudo que começa com `/sondohub/` para o backend Node/Express do Gêmeo (por isso a rota de sincronização de usuários se chama `/sondohub/users/:id`).
   - O banco Postgres do Gêmeo (schema `gemeo_digital_hotel_fairmonte`) já tem a tabela **`usuarios_sondohub`** com o `id` (UUID do Hub) e o `role` (`USER`, `ADMIN` ou `MASTER`), além dos vínculos de quais contratos cada usuário pode ver (`src/models/contratos.ts` -> `listContratosByUser`).
   - O backend do Gêmeo já tem os models/serviços de **Contratos**, **Sensores** (`/sensors`), **Séries/Monitoramento** (`/monitor`) e **Modelos BIM** (`/bimModels`).

---

### 2.2. Quais Informações o Gêmeo Digital Vai Entregar para o Assistente do Hub?

Para seguir a mesma regra de ouro do `SondoView` e do `SondoHub` (**"O modelo não faz conta: o servidor calcula tudo e devolve texto pronto para falar"**), o endpoint do Gêmeo vai consultar o banco no escopo do `hubUserId` e responder sobre **3 pilares**:

1. **Contratos e Papel do Usuário no Gêmeo**:
   - Qual é o papel dele dentro do Gêmeo (`USER`, `ADMIN` ou `MASTER`).
   - Quantos e quais contratos estão liberados para ele (se `MASTER`, todos os contratos; se `USER`/`ADMIN`, os contratos vinculados a ele na tabela de relacionamento com `usuarios_sondohub`).
2. **Sensores e Status de Monitoramento (IoT)**:
   - Total de sensores nos contratos que ele enxerga.
   - Quantos sensores estão ativos/online vs. offline ou em alerta.
   - Se a pergunta (`query`) citar o nome/código de um sensor ou contrato específico, traz os detalhes e a última leitura daquele sensor/contrato.
3. **Modelos BIM / 3D (`bimModels`)**:
   - Quantos e quais modelos BIM (Autodesk Tandem) estão disponíveis nos contratos do usuário.

---

### 2.3. Passo a Passo de Implementação no Repositório `gemeo-digital`

São apenas **2 passos** no repositório de backend `gemeo-digital`:

#### Passo 1 — Criar `src/routes/sondohubAssistant.ts` (~95 linhas)
Este arquivo valida a mesma chave `SONDOHUB_API_KEY` (com `timingSafeEqual`), busca os dados do usuário pelo `hubUserId` e monta o texto pronto para o assistente do SondoHub falar:

```ts
import { createHash, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
// Importe os models/queries existentes do gemeo-digital:
// ex.: listContratosByUser, listarSensores, listarBimModels

const router = Router();

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mesmo guard da rota PUT /sondohub/users/:id.
 * Confere o header X-Api-Key em tempo constante contra SONDOHUB_API_KEY.
 */
function requireSondoHubKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SONDOHUB_API_KEY?.trim();
  if (!expected) {
    res.status(401).json({ message: "SONDOHUB_API_KEY não configurada." });
    return;
  }
  const hash = (v: string) => createHash("sha256").update(v).digest();
  const received = req.get("x-api-key") ?? "";
  if (!timingSafeEqual(hash(received), hash(expected))) {
    res.status(401).json({ message: "Chave inválida." });
    return;
  }
  next();
}

type AssistantQueryBody = {
  hubUserId?: unknown;
  email?: unknown;
  name?: unknown;
  level?: unknown;
  levelLabel?: unknown;
  query?: unknown;
};

/**
 * POST /sondohub/assistant/query
 * Chamado pelo Assistente de IA do SondoHub (AssistenteFederacaoService).
 */
router.post("/assistant/query", requireSondoHubKey, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as AssistantQueryBody;
  const hubUserId = typeof body.hubUserId === "string" ? body.hubUserId.trim() : "";
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const levelLabel = typeof body.levelLabel === "string" ? body.levelLabel : `nível ${body.level ?? 1}`;

  if (!UUID_REGEX.test(hubUserId)) {
    res.status(400).json({ ok: false, texto: "hubUserId inválido." });
    return;
  }

  try {
    // 1. Busca o papel e os contratos do usuário na tabela usuarios_sondohub
    // (Substitua pelas chamadas reais dos seus models em src/models/contratos.ts e sensors.ts)
    const resumo = await montarResumoGemeoParaAssistente(hubUserId, levelLabel, query);
    res.json({ ok: true, texto: resumo });
  } catch (error) {
    console.error("[sondohub/assistant/query] erro:", error);
    res.status(500).json({
      ok: false,
      texto: "Não foi possível consultar os dados do Gêmeo Digital neste momento.",
    });
  }
});

/**
 * Monta o texto determinístico e pronto para fala.
 * O modelo do SondoHub recebe este texto e responde exatamente o que a pessoa perguntou.
 */
async function montarResumoGemeoParaAssistente(
  hubUserId: string,
  levelLabel: string,
  _query: string,
): Promise<string> {
  // Exemplo de integração com os models existentes do gemeo-digital:
  // const contratos = await listContratosByUser(hubUserId);
  // const sensores = await listSensorsByContracts(contratos.map(c => c.id));
  // const modelos = await listBimModelsByContracts(contratos.map(c => c.id));

  // Retorno estruturado em frases curtas para voz e chat:
  return [
    `Nível no Gêmeo Digital: ${levelLabel}.`,
    // `Contratos liberados (${contratos.length}): ${contratos.map(c => c.nome).join(', ') || 'nenhum contrato vinculado ainda'}.`,
    // `Sensores: ${sensores.length} no total (${online} online e ${offline} offline).`,
    // `Modelos BIM 3D: ${modelos.length} carregados.`,
  ].join("\n");
}

export default router;
```

#### Passo 2 — Montar a rota no `src/server.ts` do `gemeo-digital` (1 linha)
No `src/server.ts` do `gemeo-digital`, ao lado de onde já está montado o router `/sondohub/users`:
```ts
import sondohubAssistant from "./routes/sondohubAssistant.js";

// Rota servidor-a-servidor (protegida por SONDOHUB_API_KEY, fora de PEOPLE_ROUTES e DEVICE_ROUTES):
app.use("/sondohub", sondohubAssistant);
```
> **Atenção à ordem no `server.ts` do Gêmeo (Aula 14)**:
> Como o Gêmeo usa `PEOPLE_ROUTES` e `DEVICE_ROUTES` por prefixo, o prefixo `/sondohub` **não** está em nenhum dos dois, então basta usar `requireSondoHubKey` no próprio router `/sondohub`.

#### Passo 3 — Variável de Ambiente em Dev no `SondoHub` (Opcional)
- **Em produção**: O `SondoHub` já usa `https://gds-techlab.sondotecnica.com` por padrão para o slug `gemeo` e a variável `GDS_APY_KEY` que já está no `.env` do Hub! Nenhuma variável nova é obrigatória em produção.
- **Em desenvolvimento local**: Se você estiver rodando o backend do Gêmeo localmente (ex.: na porta `3333`), basta adicionar no `.env` do `SondoHub`:
  ```env
  GEMEO_API_URL=http://localhost:3333
  ```
  E o `AssistenteFederacaoService` vai chamar `http://localhost:3333/sondohub/assistant/query` usando a mesma `GDS_APY_KEY`!

---

## 3. Como Testar a Integração `SondoHub` ↔ `Gêmeo Digital`

### Teste 1 — Direto na API do Gêmeo Digital (via `curl.exe`)
Antes mesmo de abrir o microfone no SondoHub, você pode validar a rota do Gêmeo com 1 comando no PowerShell:

```powershell
curl.exe -i -X POST http://localhost:<PORT_GEMEO>/sondohub/assistant/query `
  -H "Content-Type: application/json" `
  -H "X-Api-Key: <valor_da_SONDOHUB_API_KEY>" `
  -d '{\"hubUserId\":\"11111111-1111-4111-8111-111111111111\",\"email\":\"admin@sondotecnica.com.br\",\"name\":\"Admin\",\"level\":3,\"levelLabel\":\"Master\",\"query\":\"Quais contratos e sensores tenho no Gêmeo?\"}'
```

| Cenário | Resultado Esperado |
| :--- | :--- |
| Sem header `X-Api-Key` ou com chave errada | `HTTP 401 Unauthorized` |
| `hubUserId` que não é UUID | `HTTP 400 Bad Request` |
| Chave correta e `hubUserId` válido | `HTTP 200 OK` com `{"ok":true,"texto":"..."}` trazendo os contratos, sensores e modelos daquele usuário |

### Teste 2 — Pelo Assistente de Voz ou Chat no `SondoHub`
1. Entre no `SondoHub` (`http://localhost:5180`) com um usuário que tenha o card do **Gêmeo Digital** ativo.
2. Abra o **Chat do Assistente** (ou clique na bolinha para falar por **Voz**).
3. Pergunte:
   - *"O que eu tenho liberado dentro do Gêmeo Digital?"*
   - *"Quantos sensores e contratos estão ativos no Gêmeo?"*
4. Confira em `/admin/assistente` -> **Auditoria**:
   - Deve aparecer o registro da ferramenta **`consultar_app_filho`** com `argumentos: {"app":"Gêmeo Digital","consulta":"..."}` e o `resultado: "[Gêmeo Digital] ..."` retornado pela API do Gêmeo.

---

## 4. Replicando Depois para o `SondoView` e `Experience`

Uma vez validado no **Gêmeo Digital**, replicar para os outros dois sistemas leva menos de 30 minutos cada:

1. **No `sondoview-main/backend`**:
   - Criar `src/routes/sondohubFederacao.ts` validando `X-Api-Key: process.env.SONDOHUB_API_KEY`.
   - Resolver o usuário local pelo e-mail (`X-Hub-User-Email`) e chamar as funções que **já existem** em `src/assistente/dados.ts` (`listarAgenciasAssistente`, `consultarAvancoAssistente`, `consultarDiarioAssistente`, `consultarCenasAssistente`).
   - Adicionar `SONDOVIEW_API_URL` e `SONDOVIEW_API_KEY` no `.env` do `SondoHub`.
2. **No `api-admin-experience`**:
   - No `sondohubUsersController.ts` (ou `sondohubAssistantController.ts`), adicionar a rota `POST /api/sondohub/assistant/query` usando o `sondohubApiKeyMiddleware` que já está pronto lá.
   - Consultar os eventos e pesquisas de satisfação visíveis para o `hub_user_id` na tabela `app_experience.usuarios`.
   - O `SondoHub` já tem `EXPERIENCE_API_URL` e `EXPERIENCE_API_KEY` configurados no `.env`, então funciona automaticamente!
