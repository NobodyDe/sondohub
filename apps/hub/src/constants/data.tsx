import { Box, Building2, FileText, Gauge, Map, Wrench } from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Provisório: apps só para visualização no front. Troque pelos dados reais.
export type PreviewApp = {
  id: string;
  slug: string;
  name: string;
  icon: LucideIcon;
  gradient: string; // classe inteira, senão o Tailwind não gera (ver index.css)
  url: string;
  origin: string;
  is_active: boolean;
  levels: { level: number; label: string }[];
};

const DEFAULT_LEVELS = [
  { level: 1, label: "Leitura" },
  { level: 2, label: "Edição" },
  { level: 3, label: "Admin" },
];

export const PREVIEW_APPS: PreviewApp[] = [
  {
    id: "7b0f4c1e-5a52-4f0b-9c55-1f6a3c2d8e01",
    slug: "gemeo",
    name: "Gêmeo Digital",
    icon: Box,
    gradient: "bg-g-sky text-on-sky",
    url: "https://gemeo.sondotecnica.com.br",
    origin: "https://gemeo.sondotecnica.com.br",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
  {
    id: "c2a9d6f3-8e41-4b7a-a3d0-4e9b5f7c1a02",
    slug: "cco",
    name: "Orion",
    icon: Gauge,
    gradient: "bg-g-deep",
    url: "https://cco.sondotecnica.com.br",
    origin: "https://cco.sondotecnica.com.br",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
  {
    id: "1e8b3d27-6c90-4a15-b8f2-9d3c7a5e4b03",
    slug: "obras",
    name: "SondoView",
    icon: Building2,
    gradient: "bg-g-royal",
    url: "https://sondoview.sondotecnica.com",
    origin: "https://sondoview.sondotecnica.com",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
  {
    id: "9d4f7a60-2b18-4e3c-8a71-6c0e5b9d2f04",
    slug: "mapas",
    name: "SondoApp",
    icon: FileText,
    gradient: "bg-g-azure",
    url: "https://mapas.sondotecnica.com.br",
    origin: "https://mapas.sondotecnica.com.br",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
  {
    id: "4a6c1e95-7d33-4f82-b0a9-2e8d6c3f7a05",
    slug: "relatorios",
    name: "SondoVerso",
    icon: Map,
    gradient: "bg-g-sky text-on-sky",
    url: "https://relatorios.sondotecnica.com.br",
    origin: "https://relatorios.sondotecnica.com.br",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
  {
    id: "e5b2d8c4-1f67-4a09-9e34-7a1c4d6b8e06",
    slug: "manutencao",
    name: "Manutenção",
    icon: Wrench,
    gradient: "bg-g-deep",
    url: "https://manutencao.sondotecnica.com.br",
    origin: "https://manutencao.sondotecnica.com.br",
    is_active: true,
    levels: DEFAULT_LEVELS,
  },
];
