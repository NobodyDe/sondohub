import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { AdminUserPage } from "./features/admin/admin-user-page.tsx";
import { AdminUsersPage } from "./features/admin/admin-users-page.tsx";
import { NewUserPage } from "./features/admin/new-user-page.tsx";
import { LoginPage } from "./features/auth/login-page.tsx";
import "./index.css";
import { z } from "zod";
import { LauncherPage } from "./features/launcher/launcher-page.tsx";
z.config(z.locales.pt());

const router = createBrowserRouter([
  { path: "/", element: <LauncherPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/admin/usuarios", element: <AdminUsersPage /> },
  { path: "/admin/usuarios/novo", element: <NewUserPage /> },
  { path: "/admin/usuarios/:id", element: <AdminUserPage /> },
  { path: "/", element: <LoginPage /> },
]);

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
