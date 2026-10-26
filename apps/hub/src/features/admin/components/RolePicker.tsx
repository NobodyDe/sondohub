import { LockKeyhole } from "lucide-react";
import { cn } from "../../../lib/utils.ts";
import { ROLE_ORDER, ROLES } from "../roles.ts";
import type { UserRole } from "@sondohub/contracts";

type RolePickerProps = {
  value: UserRole;
  onChange: (role: UserRole) => void;
};

export default function RolePicker({ value, onChange }: RolePickerProps) {
  return (
    <section aria-labelledby="role-title" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="role-title" className="text-lg font-bold">
          Cargo
        </h2>
        <p className="text-sm text-muted-foreground">Define o que a pessoa pode fazer no SondoHub.</p>
      </div>

      {/* Radios de verdade (escondidos): o teclado navega com as setas e o leitor de tela entende o grupo. */}
      <div role="radiogroup" aria-labelledby="role-title" className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
        {ROLE_ORDER.map((role) => (
          <RoleOption key={role} role={role} checked={value === role} onSelect={() => onChange(role)} />
        ))}
      </div>
    </section>
  );
}

type RoleOptionProps = {
  role: UserRole;
  checked: boolean;
  onSelect: () => void;
};

function RoleOption({ role, checked, onSelect }: RoleOptionProps) {
  const { label, description, canAccessPanel, icon: Icon, iconClassName } = ROLES[role];

  return (
    <label
      className={cn(
        "flex cursor-pointer flex-col gap-3.5 rounded-[14px] border-[1.5px] border-border bg-section p-[18px] transition-colors hover:border-line-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        checked && "border-primary bg-primary-soft hover:border-primary",
      )}
    >
      <span className="flex items-center gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-[11px]", iconClassName)}>
          <Icon className="size-5 text-white" strokeWidth={2} aria-hidden />
        </span>
        <span className="flex-1 text-base font-bold">{label}</span>
        <input type="radio" name="role" value={role} checked={checked} onChange={onSelect} className="sr-only" />
        <span
          aria-hidden
          className={cn(
            "size-5 shrink-0 rounded-full border-2 border-line-hover transition-all",
            checked && "border-primary bg-primary shadow-[inset_0_0_0_4px_var(--primary-soft)]",
          )}
        />
      </span>
      <span className="text-[13px] leading-relaxed text-ink-body">{description}</span>
      <span
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold",
          canAccessPanel ? "text-link" : "text-ink-placeholder",
        )}
      >
        <LockKeyhole className="size-3.5" aria-hidden />
        {canAccessPanel ? "Acessa o painel de administração" : "Sem acesso ao painel"}
      </span>
    </label>
  );
}
