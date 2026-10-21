import { Crown, ShieldCheck, UserRound, type LucideIcon } from "lucide-react";
import type { UserRole } from "@sondohub/contracts";

type RoleInfo = {
  label: string;
  shortLabel: string;
  description: string;
  canAccessPanel: boolean;
  icon: LucideIcon;
  iconClassName: string;
  badgeClassName: string;
};

export const ROLES: Record<UserRole, RoleInfo> = {
  MASTER: {
    label: "Master",
    shortLabel: "Master",
    description: "Controle total. Cria e remove usuários, define cargos e libera aplicativos.",
    canAccessPanel: true,
    icon: Crown,
    iconClassName: "bg-[linear-gradient(135deg,#8b5cf6,#ec4899)]",
    badgeClassName: "bg-[#3a1f4a] text-[#f0c2ff]",
  },
  ADMIN: {
    label: "Administrador",
    shortLabel: "Admin",
    description: "Gerencia os aplicativos que tem liberados, com acesso às configurações de cada um.",
    canAccessPanel: false,
    icon: ShieldCheck,
    iconClassName: "bg-g-blue",
    badgeClassName: "bg-[#1e2b55] text-[#b9ccff]",
  },
  USER: {
    label: "Usuário",
    shortLabel: "Usuário",
    description: "Usa os aplicativos liberados, com a permissão definida em cada um.",
    canAccessPanel: false,
    icon: UserRound,
    iconClassName: "bg-g-teal",
    badgeClassName: "bg-muted text-ink-body",
  },
};

/** Ordem em que os cargos aparecem na tela. */
export const ROLE_ORDER: UserRole[] = ["MASTER", "ADMIN", "USER"];
