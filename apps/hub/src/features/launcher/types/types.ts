import type { LauncherApp } from "@sondohub/contracts";

export type AppView = LauncherApp & {
  description: string;
  isFavorite: boolean;
  category: string;
};
