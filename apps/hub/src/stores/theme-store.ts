import { create } from "zustand";

type Theme = "light" | "dark";

type ThemeStore = {
  theme: Theme;
  toggleTheme: () => void;
};

/** Aplica o tema na página e salva a escolha (mesma chave que o index.html lê). */
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.theme = theme;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  // O script do index.html já decidiu o tema; aqui só lemos o resultado.
  theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    applyTheme(next);
    set({ theme: next });
  },
}));
