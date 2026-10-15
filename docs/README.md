# SondoHub — Documentação

O SondoHub é o hub de acesso unificado da Sondotecnica: **um login, uma conta e um nível de permissão por app**, com um widget ▦ em cada aplicativo (estilo Microsoft 365).

Esta pasta é um **guia de implementação em formato de curso**. Você escreve o código; cada aula explica o porquê, mostra o código de referência e termina com um checkpoint para conferir.

## Ordem de leitura

| # | Documento | Você sai com |
|---|---|---|
| 01 | [Arquitetura](01-arquitetura.md) | As decisões e o porquê de cada uma (Nest, tokens, padrão de projeto, roteiro) |
| 02 | [Setup do monorepo](02-setup-monorepo.md) | Monorepo com hub, API, demo e packages, `.env` compartilhado e portas sem conflito |
| 03 | [Banco de dados](03-aula-banco-de-dados.md) | Postgres com usuários, apps, **níveis por app** e sessões, mais o seed |
| 04 | [API: login e sessão](04-aula-api-login-e-sessao.md) | Login, cookie de sessão, guards globais, proteção contra força bruta e CSRF |
| 05 | [SSO: tokens e JWKS](05-aula-sso-e-tokens.md) | Access token por app (RS256), JWKS público e CORS do SSO |
| 06 | [Hub: login e launcher](06-aula-hub-front.md) | Tela de login com `returnTo` seguro e a central de apps |
| 07 | [SDK, widget e demo](07-aula-sdk-widget-e-demo.md) | `@sondohub/client` (SDK + ▦), `@sondohub/server` e o SSO completo no navegador |

## Formato de cada aula

- 🎯 **Objetivo:** o que funciona no fim.
- 🧠 **Conceito:** o problema e por que a solução é essa (e não as alternativas).
- 🛠️ **Passos:** o código de referência, com o motivo de cada parte.
- ✅ **Checkpoint:** como provar que funcionou.
- ⚠️ **Atenção:** limites e o que fica para depois, de propósito.
- 🏋️ **Exercícios:** com respostas escondidas.

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
| `pnpm db:migrate` | Aplica as migrations |
| `pnpm db:seed` | Cria o admin, o leitor e o app demo |
| `pnpm db:studio` | Abre o Prisma Studio |
| `pnpm test` | Roda os testes de todos os apps e packages |

> Todo o código de referência destas aulas foi compilado e testado (build, testes unitários e checagens de segurança via HTTP) em 15/10/2026, com Node 24, NestJS 12, Prisma 6.19, React 19, Vite 8 e Tailwind 4.
