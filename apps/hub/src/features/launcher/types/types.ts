import type { LauncherApp } from "@sondohub/contracts";
import type { LucideIcon } from "lucide-react";

export type AppView = LauncherApp & {
  // Só os apps de visualização têm ícone Lucide + degradê no lugar do iconUrl.
  icon?: LucideIcon;
  gradient?: string;
  description: string;
  isFavorite: boolean;
  category: string;
};
