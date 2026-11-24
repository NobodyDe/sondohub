-- Cadastra o Experience no catálogo, com o endereço de DEV (o front do Experience em http://localhost:5183).
-- Entra INATIVO nos dois bancos: inativo, o app não aparece no ▦, não recebe token e não libera CORS.
-- Assim a produção nunca aceita http://localhost por engano. Depois de rodar:
--   dev:      Catálogo → Experience → ativar
--   produção: Catálogo → Experience → trocar a URL pela real (a origem é recalculada ao salvar) → ativar
-- Os níveis são o próprio adm do Experience (1 = admin, 2 = usuário): ver ADM_BY_LEVEL no ExperienceClient.
-- ON CONFLICT: se alguém já cadastrou o Experience pelo Catálogo, a migration não mexe nele.
INSERT INTO "applications" ("id", "slug", "name", "description", "icon_url", "url", "origin", "levels", "is_active")
VALUES (
  gen_random_uuid(),
  'experience',
  'Experience',
  'Eventos, apresentações e pesquisa de satisfação do Experience',
  'https://admin-experience.sondotecnica.com/logo-experience.svg',
  'https://admin-experience.sondotecnica.com/login/sondohub',
  'https://admin-experience.sondotecnica.com',
  '[
    { "level": 1, "label": "Administrador" },
    { "level": 2, "label": "Usuário" }
  ]'::jsonb,
  false
)
ON CONFLICT ("slug") DO NOTHING;
