# SondoHub — Documentação

O SondoHub é o hub de acesso unificado da Sondotecnica: **um login, uma conta e um nível de permissão por app**, com um widget ▦ em cada aplicativo (estilo Microsoft 365).

Esta pasta é um **guia de implementação em formato de curso**. Você escreve o código; cada aula explica o porquê, mostra o código de referência e termina com um checkpoint para conferir.

**O método:** primeiro **funcionar**, uma rota de cada vez, do jeito mais simples. Cada aula termina com a rota testada. As proteções entram todas juntas na aula 08, quando tudo já estiver de pé, e cada aula lista o que ficou "cru" de propósito.

## Ordem de leitura

| # | Documento | Você sai com |
|---|---|---|
| 01 | [Arquitetura](01-arquitetura.md) | As decisões e o porquê de cada uma |
| 02 | [Setup do monorepo](02-setup-monorepo.md) | Monorepo, `.env` compartilhado e portas sem conflito ✅ *feito* |
| — | [Apêndice: banco de dados](apendice-banco-de-dados.md) | Usuários, apps, níveis por app e sessões ✅ *feito* |
| 03 | [Rota de login](03-aula-login.md) | `POST /api/auth/login`: sessão no cookie + dados do usuário |
| 04 | [Quem sou eu, meus apps e sair](04-aula-sessao-e-apps.md) | `GET /api/me`, `GET /api/me/apps` (com o **nível**) e `POST /api/auth/logout` |
| 05 | [Hub: login e launcher](05-aula-hub-front.md) | A central consumindo essas rotas no navegador |
| 06 | [Token para os apps](06-aula-token-para-apps.md) | `POST /api/sso/token` (JWT por app, com o nível) + JWKS + CORS simples |
| 07 | [App consumindo o hub](07-aula-app-consumindo-o-hub.md) | SDK, widget ▦, middleware do backend, `returnTo` e o roteiro para **apps reais** |
| 07b | [Plugando o Gêmeo Digital](07b-aula-plugando-o-gemeo.md) | O primeiro app real no hub, arquivo por arquivo, a receita para os outros apps e os bloqueios de produção |
| 08 | [Fechando as portas](08-aula-seguranca.md) | Guard global, validação, rate limit, bloqueio, CSRF, CORS dinâmico e testes |
| 09 | [Banco da empresa (Azure)](09-banco-da-empresa.md) | As tabelas criadas no schema `sondohub` do PostgreSQL da empresa com `migrate deploy`, o primeiro Master e os apps reais |
| 10 | [Tela do usuário no admin](10-aula-admin-usuario.md) | `GET /api/admin/users/:id` com todos os apps, níveis e `hasAccess`; editar cargo, ativo e acesso aos apps; remover usuário |
| 11 | [Criar usuário](11-aula-criar-usuario.md) | `POST /api/admin/users` só para Master (o `MasterGuard` explicado), com cargo e apps numa transação, e a tela de novo usuário funcionando |
| 12 | [Catálogo de aplicativos](12-aula-admin-apps.md) | `GET/POST /api/admin/apps` e `GET/PUT /api/admin/apps/:id` (origem e ícone padrão saem da URL, níveis como escada), a tela do catálogo com prévia ao vivo e o fim do `FAKE_APPS` |
| 13 | [Deploy em Docker](../deploy/README.md) | O hub e a API 24/7 em `https://hub.sondotecnica.com`, ao lado do outro projeto da VM, com deploy em um comando a partir do PC |

## Formato de cada aula

- 🎯 **Objetivo:** o que funciona no fim.
- 🧠 **Conceito:** o problema e por que a solução é essa.
- 🛠️ **Passos:** o código de referência e o motivo de cada parte. Teste logo depois de cada rota.
- ✅ **Checkpoint:** como provar que funcionou.
- ⏳ **O que ficou para depois:** o que está cru de propósito e em que aula se resolve.

## Referência rápida

| Processo | Porta |
|---|---|
| API (Nest) | 3100 |
| Hub | 5180 |
| Demo | 5181 |
| API do demo | 4100 |
| Postgres (Docker) | 5433 |

| Comando | Faz |
|---|---|
| `pnpm dev` | Compila os packages e sobe tudo em paralelo |
| `pnpm db:up` | Sobe o Postgres (Docker) |
| `pnpm db:migrate` | Cria e aplica migrations (só no Docker) |
| `pnpm db:deploy` | Aplica as migrations pendentes no banco da empresa (guia 09) |
| `pnpm db:seed` | Cria o admin, o leitor e o app demo |
| `pnpm db:studio` | Abre o Prisma Studio |
| `pnpm test` | Roda os testes de todos os apps e packages |

> **Como estas aulas foram validadas (16/10/2026):** o código de referência foi aplicado, aula por aula, num clone do seu repositório (commit `aca59df`).
> - Cada etapa compilou, passou no lint e foi testada contra um Postgres real.
> - O fluxo foi conferido no navegador: login, launcher, SSO no demo, níveis, logout e "sem acesso".
> - Um app Vite externo foi plugado via `link:`.
> - Os ataques da aula 08 falharam como deveriam.
