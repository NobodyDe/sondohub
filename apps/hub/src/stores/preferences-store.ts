import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SIDEBAR_MAX_WIDTH } from "../features/launcher/sidebar-width.ts";

type PreferencesStore = {
  appOrder: string[]; // slugs na ordem escolhida pelo usuário
  favorites: string[];
  sidebarWidth: number;
  setAppOrder: (slugs: string[]) => void;
  setSidebarWidth: (width: number) => void;
  toggleFavorite: (slug: string) => void;
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      appOrder: [],
      favorites: [],
      sidebarWidth: SIDEBAR_MAX_WIDTH,
      setAppOrder: (appOrder) => set({ appOrder }),
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      toggleFavorite: (slug) =>
        set(({ favorites }) => ({
          favorites: favorites.includes(slug)
            ? favorites.filter((favorite) => favorite !== slug)
            : [...favorites, slug],
        })),
    }),
    { name: "sondohub-preferences" },
  ),
);
