import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { z } from "zod";
import { adminRoutes } from "./features/admin/routes.tsx";
import { LoginPage } from "./features/auth/login-page.tsx";
import { LauncherPage } from "./features/launcher/launcher-page.tsx";
import { EditUserPage } from "./features/user/edit-user-page.tsx";
import "./index.css";

z.config(z.locales.pt());

const router = createBrowserRouter([
  { path: "/", element: <LauncherPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/perfil", element: <EditUserPage /> },
  ...adminRoutes, // /admin/* passa pelo AdminLayout: sidebar e guarda de Master.
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
