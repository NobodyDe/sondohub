import { HAS_NUMBER, HAS_SPECIAL } from "@sondohub/contracts";

// Índice = nível: 1 só letras, 2 com número ou especial, 3 com os dois.
const LEVELS = [
  { label: "", className: "bg-transparent" },
  { label: "Fraca", className: "bg-primary/30" },
  { label: "Média", className: "bg-primary/60" },
  { label: "Forte", className: "bg-primary" },
];

function getStrength(password: string) {
  if (!password) return 0;
  return (
    1 + Number(HAS_NUMBER.test(password)) + Number(HAS_SPECIAL.test(password))
  );
}

export default function PasswordStrength({ password }: { password: string }) {
  const level = LEVELS[getStrength(password)];
  return (
    <div className="flex items-center gap-2">
      <div
        className={`h-1 flex-1 rounded-full transition-colors ${level.className}`}
      />
      <span className="w-12 text-xs text-muted-foreground">{level.label}</span>
    </div>
  );
}
