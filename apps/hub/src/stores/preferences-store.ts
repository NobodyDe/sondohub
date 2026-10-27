import { create } from "zustand";
import { persist } from "zustand/middleware";

type PreferencesStore = {
  appOrder: string[]; // slugs na ordem escolhida pelo usuário
  favorites: string[];
  setAppOrder: (slugs: string[]) => void;
  toggleFavorite: (slug: string) => void;
};

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set) => ({
      appOrder: [],
      favorites: [],
      setAppOrder: (appOrder) => set({ appOrder }),
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
