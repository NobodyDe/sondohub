import type { RouteObject } from "react-router";
import { AssistenteMemoriasPage } from "./pages/AssistenteMemoriasPage.tsx";
import { AssistentePerguntasPage } from "./pages/AssistentePerguntasPage.tsx";
import { AssistenteRegrasPage } from "./pages/AssistenteRegrasPage.tsx";
import { AssistenteSettingsPage } from "./pages/AssistenteSettingsPage.tsx";

/** Telas pessoais do assistente (/assistente/*). As de administração entram em features/admin/routes.tsx. */
export const assistenteRoutes: RouteObject[] = [
  { path: "/assistente", element: <AssistenteSettingsPage /> },
  { path: "/assistente/regras", element: <AssistenteRegrasPage /> },
  { path: "/assistente/memorias", element: <AssistenteMemoriasPage /> },
  { path: "/assistente/perguntas", element: <AssistentePerguntasPage /> },
];
