import { Navigate, type RouteObject } from "react-router";
import { AppDetailPage } from "./apps/pages/app-detail-page.tsx";
import { AppsListPage } from "./apps/pages/apps-list-page.tsx";
import { NewAppPage } from "./apps/pages/new-app-page.tsx";
import AdminLayout from "./layout/AdminLayout.tsx";
import { NewUserPage } from "./users/pages/new-user-page.tsx";
import { UserDetailPage } from "./users/pages/user-detail-page.tsx";
import { UsersListPage } from "./users/pages/users-list-page.tsx";

/** Tudo debaixo de /admin passa pelo AdminLayout (perfil, guarda de Master e sidebar). */
export const adminRoutes: RouteObject[] = [
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="usuarios" replace /> },
      { path: "usuarios", element: <UsersListPage /> },
      { path: "usuarios/novo", element: <NewUserPage /> },
      { path: "usuarios/:id", element: <UserDetailPage /> },
      { path: "aplicativos", element: <AppsListPage /> },
      { path: "aplicativos/novo", element: <NewAppPage /> },
      { path: "aplicativos/:id", element: <AppDetailPage /> },
    ],
  },
];
