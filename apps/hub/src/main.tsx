import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { LoginPage } from "./features/auth/login-page.tsx";
import "./index.css";
import { z } from "zod";
import { LauncherPage } from "./features/launcher/launcher-page.tsx";
z.config(z.locales.pt());

const router = createBrowserRouter([
  { path: "/", element: <LauncherPage /> },
  { path: "/login", element: <LoginPage /> },
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
