import { zodResolver } from "@hookform/resolvers/zod";
import {
  passwordSchema,
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from "@sondohub/contracts";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import PasswordStrength from "@/features/admin/users/components/PasswordStrength";
import { ApiError, hubApi } from "@/lib/api";
import { SondoMark } from "./sondo-mark.tsx";

const STEPS = ["email", "code", "password"] as const;
type Step = (typeof STEPS)[number] | "done";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000; // mesmo prazo que o backend dá ao código

const inputClass = "h-11 rounded-[10px] px-3.5 text-[15px] md:text-[15px]";
const buttonClass = "h-11 rounded-[10px] text-[15px] font-semibold";

/** Traduz o status da API na mensagem da etapa; o resto cai na genérica. */
function errorMessage(err: unknown, byStatus: Record<number, string>) {
  const status = err instanceof ApiError ? err.status : 0;
  if (status === 429) return "Muitas tentativas. Aguarde um minuto.";
  return byStatus[status] ?? "Não foi possível continuar. Tente de novo.";
}

export function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");

  return (
    // "dark" aqui força o modo escuro só nesta página, sem mexer no tema salvo.
    <div className="dark flex min-h-svh flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-6 py-6 lg:px-10">
        <SondoMark
          role="img"
          aria-label="Logo Sondotécnica"
          className="h-8 w-auto text-accent-sky"
        />
        <span className="text-[17px] font-bold tracking-[-0.01em]">
          Sondotécnica
        </span>
      </header>

      <main className="flex flex-1 items-start justify-center px-6 pt-10 pb-12 lg:items-center">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          {step !== "done" && <StepBars current={STEPS.indexOf(step)} />}

          {step === "email" && (
            <EmailStep
              onSent={(sentTo) => {
                setEmail(sentTo);
                setStep("code");
              }}
            />
          )}
          {step === "code" && (
            <CodeStep
              email={email}
              onVerified={(verified) => {
                setCode(verified);
                setStep("password");
              }}
            />
          )}
          {step === "password" && (
            <PasswordStep
              email={email}
              code={code}
              onDone={() => setStep("done")}
            />
          )}
          {step === "done" && <Done />}

          {(step === "code" || step === "password") && (
            <button
              type="button"
              className="self-start text-sm font-medium text-link hover:text-link-hover hover:underline"
              onClick={() => setStep("email")}
            >
              Usar outro e-mail
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function StepBars({ current }: { current: number }) {
  return (
    <div className="flex gap-2">
      <p className="sr-only">
        Etapa {current + 1} de {STEPS.length}
      </p>
      {STEPS.map((name, i) => (
        <span
          key={name}
          aria-hidden="true"
          className={cn(
            "h-1 flex-1 rounded-full",
            i <= current ? "bg-g-sky" : "bg-border",
          )}
        />
      ))}
    </div>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-3xl leading-tight font-bold tracking-[-0.025em]">
        {title}
      </h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {children}
      </p>
    </div>
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const form = useForm({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(input: RequestPasswordResetInput) {
    try {
      await hubApi.requestPasswordReset(input);
      onSent(input.email);
    } catch (err) {
      form.setError("root", { message: errorMessage(err, {}) });
    }
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Heading title="Recuperar acesso">
        Informe seu e-mail corporativo. Enviamos um código para você criar uma
        nova senha.
      </Heading>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email" className="font-semibold">
            E-mail
          </FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            placeholder="nome@sondotecnica.com.br"
            className={inputClass}
            aria-invalid={!!errors.email}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <FieldError>{errors.root?.message}</FieldError>
        <Button type="submit" disabled={isSubmitting} className={buttonClass}>
          {isSubmitting ? "Enviando..." : "Enviar código"}
        </Button>
      </FieldGroup>
    </form>
  );
}

/** Segundos que faltam até o prazo, atualizados a cada segundo. */
function useSecondsLeft(deadline: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

type CodeStepProps = { email: string; onVerified: (code: string) => void };

function CodeStep({ email, onVerified }: CodeStepProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deadline, setDeadline] = useState(() => Date.now() + CODE_TTL_MS);
  const secondsLeft = useSecondsLeft(deadline);
  const expired = secondsLeft === 0;

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await hubApi.verifyResetCode({ email, code });
      onVerified(code);
    } catch (err) {
      setError(errorMessage(err, { 400: "Código inválido ou expirado." }));
      setIsSubmitting(false);
    }
  }

  async function resend() {
    try {
      await hubApi.requestPasswordReset({ email });
      setCode("");
      setError("");
      setDeadline(Date.now() + CODE_TTL_MS);
    } catch (err) {
      setError(errorMessage(err, {}));
    }
  }

  return (
    <form className="flex flex-col gap-8" onSubmit={verify} noValidate>
      <Heading title="Digite o código">
        Se existir uma conta para{" "}
        <span className="font-semibold text-foreground">{email}</span>,
        enviamos um código de 6 dígitos.
      </Heading>
      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="code" className="font-semibold">
            Código
          </FieldLabel>
          <CodeInput
            value={code}
            onChange={(next) => {
              setCode(next);
              setError("");
            }}
          />
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span
              className={cn(
                "font-mono",
                secondsLeft > 60 ? "text-accent-sky" : "text-danger-text",
              )}
            >
              {expired ? "Código expirado" : `Expira em ${formatClock(secondsLeft)}`}
            </span>
            <button
              type="button"
              className="font-medium text-link hover:text-link-hover hover:underline"
              onClick={resend}
            >
              Reenviar código
            </button>
          </div>
          <FieldError>{error}</FieldError>
        </Field>
        <Button
          type="submit"
          disabled={isSubmitting || expired || code.length < CODE_LENGTH}
          className={buttonClass}
        >
          {isSubmitting ? "Conferindo..." : "Confirmar código"}
        </Button>
      </FieldGroup>
    </form>
  );
}

type CodeInputProps = { value: string; onChange: (value: string) => void };

/** Um input só, invisível, por cima de seis células desenhadas: colar funciona de graça. */
function CodeInput({ value, onChange }: CodeInputProps) {
  // Célula que recebe o próximo dígito (a última, se já estiver cheio).
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <div className="group relative">
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={CODE_LENGTH}
        value={value}
        onChange={(event) =>
          onChange(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))
        }
        className="absolute inset-0 z-10 cursor-text opacity-0"
      />
      <div aria-hidden="true" className="flex gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex h-14 flex-1 items-center justify-center rounded-[10px] border border-input bg-section font-mono text-2xl font-semibold",
              i === activeIndex &&
                "group-focus-within:border-accent-sky group-focus-within:ring-2 group-focus-within:ring-accent-sky/30",
            )}
          >
            {value[i]}
          </span>
        ))}
      </div>
    </div>
  );
}

const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    path: ["confirm"],
    message: "As senhas não são iguais.",
  });
type NewPasswordInput = z.infer<typeof newPasswordSchema>;

type PasswordStepProps = { email: string; code: string; onDone: () => void };

function PasswordStep({ email, code, onDone }: PasswordStepProps) {
  const form = useForm({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ password }: NewPasswordInput) {
    try {
      await hubApi.resetPassword({ email, code, password });
      onDone();
    } catch (err) {
      form.setError("root", {
        message: errorMessage(err, {
          400: "O código expirou. Volte e peça um novo.",
        }),
      });
    }
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <Heading title="Crie uma nova senha">
        Use no mínimo 8 caracteres, com um número e um caractere especial.
      </Heading>
      <FieldGroup>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password" className="font-semibold">
            Nova senha
          </FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <PasswordStrength password={form.watch("password")} />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirm}>
          <FieldLabel htmlFor="confirm" className="font-semibold">
            Confirmar nova senha
          </FieldLabel>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            className={inputClass}
            aria-invalid={!!errors.confirm}
            {...form.register("confirm")}
          />
          <FieldError errors={[errors.confirm]} />
        </Field>
        <FieldError>{errors.root?.message}</FieldError>
        <Button type="submit" disabled={isSubmitting} className={buttonClass}>
          {isSubmitting ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </FieldGroup>
    </form>
  );
}

function Done() {
  return (
    <div className="flex flex-col gap-8">
      <Heading title="Senha alterada">
        Entre de novo com a nova senha. As sessões abertas em outros
        dispositivos foram encerradas.
      </Heading>
      <a
        href="/login"
        className="flex h-11 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-primary-foreground hover:text-primary-foreground"
      >
        Voltar para o login
      </a>
    </div>
  );
}
