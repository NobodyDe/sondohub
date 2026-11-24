# Plano de implantação do assistente

Spec: [design.md](./design.md). Cada entrega termina com testes e build do lado alterado. Sem commit nem deploy sem pedido.

## Entrega 1: contratos e banco
- Tipos e schemas zod do assistente em `packages/contracts`.
- Models Prisma (`assistente_*`) em `apps/api/prisma/schema.prisma`.
- Migration SQL gerada offline com `prisma migrate diff`, em `apps/api/prisma/migrations/<timestamp>_assistant/`. Mostrar o SQL ao dono; ele aplica.
- `prisma generate` e build do contracts.

## Entrega 2: núcleo puro do backend (com `*.spec.ts`)
`crypto`, `types`, `rules`, `memories`, `quick-questions`, `validate-key`, `weather`, `web-search`. Env opcionais em `config/env.ts` e `.env.example` (`ASSISTENTE_CHAVE_SECRETA`, `GEMINI_LIVE_MODEL`, `GEMINI_SEARCH_MODEL`). Dependências: `@google/genai`, `ws`, `@types/ws`.

## Entrega 3: persistência, permissão e rotas HTTP
`assistente.repository.ts` (Prisma), `assistente.controller.ts`, `assistente-admin.controller.ts`, `assistente.module.ts` e registro no `AppModule`. Permissão por usuário (`MASTER` sempre autorizado). Specs do que tiver regra (resolução de chave, autorização).

## Entrega 4: ferramentas e prompt
`tools.ts`, `domain-queries.ts`, `executor.ts` (auditoria, bloqueio por regra, checagem de papel), `catalog.ts`, `prompt.ts`, `guide.ts`. Specs de formatação, catálogo por papel e prompt.

## Entrega 5: sessão de voz e WebSocket
`voice-session.ts`, `assistente.gateway.ts` e o `attach` no `main.ts` (autenticação por cookie no upgrade, checagem de `Origin`). Ajuste de `deploy/nginx/hub.conf` e `deploy/nginx/hub.sondotecnica.com.conf` para `Upgrade`. Build e testes da API.

## Entrega 6: núcleo do frontend
`vitest` no `apps/hub`; `lib/pcm`, `lib/mic-mode`, `lib/audio-devices` (+ testes); `api.ts` e `use-assistant-config`; `use-assistant-voice` e `use-assistant-chat`.

## Entrega 7: componentes, telas e rotas
Bolinha, chat, seletores, formulário de chave; páginas pessoais e de admin; switch de autorização em `user-detail-page.tsx`; rota-mãe com a bolinha em `main.tsx`; entradas de menu. Lint, build e testes do hub.

## Entrega 8: verificação
Checklist da skill com evidências, subir o app e validar o que der. Pedir ao dono um teste de voz com roteiro exato (não dá para ouvir áudio aqui).

## Passos manuais do dono
1. Aplicar a migration (dev, depois produção).
2. Definir `ASSISTENTE_CHAVE_SECRETA` (32+ caracteres aleatórios) no `.env` e na produção.
3. Cadastrar a chave do Gemini em `/admin/assistente` depois do deploy (nunca no chat).
4. Liberar `Upgrade` nos dois nginx e fazer o deploy.
5. Autorizar os usuários em `/admin/usuarios/:id`.
