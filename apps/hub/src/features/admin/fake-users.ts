import type { AdminUser, CatalogApp } from "./types.ts";

// Dados de exemplo até a integração com GET /api/admin/apps.
export const FAKE_APPS: CatalogApp[] = [
  {
    slug: "demo",
    name: "App Demo",
    levels: [
      { level: 1, label: "Leitura" },
      { level: 2, label: "Edição" },
      { level: 3, label: "Admin" },
    ],
  },
  {
    slug: "gemeo",
    name: "Gêmeo Digital",
    levels: [
      { level: 1, label: "Leitura" },
      { level: 2, label: "Gestor" },
    ],
  },
];

// Dados de exemplo até a integração com GET /api/admin/users.
export const FAKE_USERS: AdminUser[] = [
  {
    id: "1",
    name: "Henrique Santos",
    email: "henrique.santos@sondotecnica.com.br",
    avatarUrl: null,
    role: "MASTER",
    isActive: true,
    apps: [
      { slug: "demo", name: "App Demo", level: 3 },
      { slug: "gemeo", name: "Gêmeo Digital", level: 2 },
    ],
  },
  {
    id: "2",
    name: "Ana Ribeiro",
    email: "ana.ribeiro@sondotecnica.com.br",
    avatarUrl: null,
    role: "ADMIN",
    isActive: true,
    apps: [{ slug: "gemeo", name: "Gêmeo Digital", level: 2 }],
  },
  {
    id: "3",
    name: "Carlos Mendes",
    email: "carlos.mendes@sondotecnica.com.br",
    avatarUrl: null,
    role: "USER",
    isActive: false,
    apps: [],
  },
];
