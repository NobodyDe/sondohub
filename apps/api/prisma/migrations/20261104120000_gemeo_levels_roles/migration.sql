-- O Gêmeo Digital passa a ter os 3 papéis que a API dele aceita.
-- O número continua sendo o que vai no token; quem traduz para USER, ADMIN e MASTER é o GemeoClient.
-- Quem já tinha acesso não muda de número: 1 (Leitura) vira Usuário e 2 (Gestor) vira Administrador.
UPDATE "applications"
SET "levels" = '[
  { "level": 1, "label": "Usuário" },
  { "level": 2, "label": "Administrador" },
  { "level": 3, "label": "Master" }
]'::jsonb
WHERE "slug" = 'gemeo';
