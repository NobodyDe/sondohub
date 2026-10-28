import type { LauncherApp } from "@sondohub/contracts";

export type AppView = LauncherApp & {
  isFavorite: boolean;
  category: string;
};
