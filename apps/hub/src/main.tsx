import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, RouterProvider } from "react-router";
import { z } from "zod";
import { adminRoutes } from "./features/admin/routes.tsx";
import { AssistenteBolinha } from "./features/assistente/components/AssistenteBolinha.tsx";
import { assistenteRoutes } from "./features/assistente/routes.tsx";
import { LoginPage } from "./features/auth/login-page.tsx";
import { ResetPasswordPage } from "./features/auth/reset-password-page.tsx";
import { LauncherPage } from "./features/launcher/launcher-page.tsx";
import { NotFoundPage } from "./features/not-found/not-found-page.tsx";
import { EditUserPage } from "./features/user/edit-user-page.tsx";
import { ApiKeysPage } from "./features/developer/pages/api-keys-page.tsx";
import "./index.css";

z.config(z.locales.pt());

/** Rota-mãe sem caminho: o robô do assistente fica dentro do router e aparece em todas as telas logadas. */
function RootLayout() {
  return (
    <>
      <Outlet />
      <AssistenteBolinha />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: "/", element: <LauncherPage /> },
      { path: "/login", element: <LoginPage /> },
      { path: "/redefinir-senha", element: <ResetPasswordPage /> },
      { path: "/perfil", element: <EditUserPage /> },
      { path: "/desenvolvedor/chaves", element: <ApiKeysPage /> },
      ...assistenteRoutes,
      ...adminRoutes, // /admin/* passa pelo AdminLayout: sidebar e guarda de Master.
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
