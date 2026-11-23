import { Dialog } from "@base-ui/react/dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, Copy, KeyRound, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { CreatedApiKey, HubProfile } from "@sondohub/contracts";
import { useForm } from "react-hook-form";
import { z } from "zod";
import UserAvatar from "@/components/UserAvatar.tsx";
import {
  DIALOG_BACKDROP,
  DIALOG_POPUP,
  ICON_BUTTON,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from "@/components/dialog-classes.ts";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ApiError } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import {
  API_KEY_NAME_MAX,
  DEFAULT_EXPIRY_DAYS,
  EXPIRY_OPTIONS,
  addDays,
  formatDate,
  formatLongDate,
} from "../api-keys.ts";
import { useCreateApiKey } from "../use-api-keys.ts";

type Step = "intro" | "form" | "reveal";

type CreateApiKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner: HubProfile;
  existingNames: string[];
};

/** Criar chave em três passos: o aviso, o formulário e a chave gerada (que só aparece uma vez). */
export default function CreateApiKeyDialog({ open, onOpenChange, owner, existingNames }: CreateApiKeyDialogProps) {
  const [step, setStep] = useState<Step>("intro");
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  // Fica aqui, e não no formulário, para o modal saber que há uma criação em andamento.
  const create = useCreateApiKey();
  // Com a chave na tela, ou com ela sendo criada, só o botão Concluído fecha: um Esc ou clique fora perderia a chave.
  const locked = step === "reveal" || create.isPending;
  // Toda abertura começa do aviso. Resetar ao abrir (e não no fim da animação de saída) cobre quem reabre rápido.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep("intro");
      setCreated(null);
    }
  }

  function close() {
    onOpenChange(false);
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !locked && onOpenChange(next)}
      disablePointerDismissal={locked}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP} />
        <Dialog.Popup className={cn(DIALOG_POPUP, "max-w-[520px] gap-6 p-7")}>
          {step === "intro" && <IntroStep onContinue={() => setStep("form")} />}
          {step === "form" && (
            <FormStep
              create={create}
              owner={owner}
              existingNames={existingNames}
              onBack={() => setStep("intro")}
              onCreated={(result) => {
                setCreated(result);
                setStep("reveal");
              }}
            />
          )}
          {step === "reveal" && created && <RevealStep created={created} onDone={close} />}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CloseButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <Dialog.Close disabled={disabled} aria-label="Fechar" className={cn(ICON_BUTTON, "-mt-1.5 -mr-2")}>
      <X className="size-5" aria-hidden />
    </Dialog.Close>
  );
}

const INTRO_POINTS = [
  "A chave age como você: quem tiver ela acessa o que você acessa.",
  "Ela aparece uma vez só. Guarde em um cofre de senhas ou em uma variável de ambiente do servidor.",
  "Você pode excluir a chave quando quiser. Ela para de valer na hora.",
];

function IntroStep({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <span className="flex size-11 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
          <ShieldCheck className="size-[22px]" strokeWidth={1.8} aria-hidden />
        </span>
        <CloseButton />
      </div>

      <div className="flex flex-col gap-2">
        <Dialog.Title className="text-xl font-bold tracking-tight">
          Aplicativos do SondoHub não precisam de chave
        </Dialog.Title>
        <Dialog.Description className="text-[15px] leading-relaxed text-ink-body">
          Os aplicativos do catálogo entram com o seu login. Crie uma chave de API só para scripts e sistemas de fora
          que precisam conversar com o SondoHub.
        </Dialog.Description>
      </div>

      <ul className="flex flex-col gap-3">
        {INTRO_POINTS.map((point) => (
          <li key={point} className="flex gap-3 text-sm leading-relaxed text-ink-body">
            <Check className="mt-0.5 size-4 shrink-0 text-success" strokeWidth={2.4} aria-hidden />
            {point}
          </li>
        ))}
      </ul>

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <Dialog.Close className={SECONDARY_BUTTON}>Cancelar</Dialog.Close>
        <button type="button" onClick={onContinue} autoFocus className={PRIMARY_BUTTON}>
          Continuar com uma chave de API
        </button>
      </div>
    </>
  );
}

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Dê um nome para reconhecer a chave depois.")
    .max(API_KEY_NAME_MAX, `Use até ${API_KEY_NAME_MAX} caracteres.`),
  expiry: z.string(), // dias como texto, ou "never"
});

type FormValues = z.infer<typeof formSchema>;

const NEVER = "never";

type FormStepProps = {
  create: ReturnType<typeof useCreateApiKey>;
  owner: HubProfile;
  existingNames: string[];
  onBack: () => void;
  onCreated: (created: CreatedApiKey) => void;
};

function FormStep({ create, owner, existingNames, onBack, onCreated }: FormStepProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", expiry: String(DEFAULT_EXPIRY_DAYS) },
  });
  const { errors, isSubmitting } = form.formState;
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function onSubmit(values: FormValues) {
    const taken = existingNames.some((name) => name.toLowerCase() === values.name.toLowerCase());
    if (taken) {
      form.setError("name", { message: "Você já tem uma chave com esse nome." });
      return;
    }
    setSubmitError(null);
    const expiresInDays = EXPIRY_OPTIONS.find(({ days }) => String(days) === values.expiry)?.days ?? null;
    try {
      onCreated(await create.mutateAsync({ name: values.name, expiresInDays }));
    } catch (error) {
      setSubmitError(
        error instanceof ApiError && error.status === 403
          ? "Só o Master pode criar chave sem validade."
          : "Não deu para criar a chave. Tente de novo.",
      );
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <Dialog.Title className="text-xl font-bold tracking-tight">Criar chave de API</Dialog.Title>
        <CloseButton disabled={isSubmitting} />
      </div>

      <Field data-invalid={!!errors.name}>
        <FieldLabel htmlFor="api-key-name" className="font-semibold">
          Nome
        </FieldLabel>
        <Input
          id="api-key-name"
          autoFocus
          autoComplete="off"
          maxLength={API_KEY_NAME_MAX}
          placeholder="ex.: integracao-erp"
          aria-invalid={!!errors.name}
          className="h-11 rounded-[10px] bg-background"
          {...form.register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>

      <Field>
        <FieldLabel htmlFor="api-key-expiry" className="font-semibold">
          Expira em
        </FieldLabel>
        <div className="relative">
          <select
            id="api-key-expiry"
            className="h-11 w-full appearance-none rounded-[10px] border border-input bg-background pr-10 pl-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            {...form.register("expiry")}
          >
            {EXPIRY_OPTIONS.map(({ days, label }) => (
              <option key={days} value={days}>
                {label} ({formatDate(addDays(days))})
              </option>
            ))}
            {/* Só para apps internos; a API também recusa quem não é Master. */}
            {owner.role === "MASTER" && <option value={NEVER}>Nunca expira (apps internos)</option>}
          </select>
          <ChevronDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
        </div>
      </Field>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Conta vinculada</span>
        <div className="flex items-center gap-3 rounded-[10px] border border-input bg-field-readonly px-3 py-2.5">
          <UserAvatar name={owner.name} url={owner.avatarUrl} className="size-8 text-xs" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold">{owner.name}</span>
            <span className="truncate text-[13px] text-muted-foreground">{owner.email}</span>
          </div>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          As chamadas com esta chave agem como você. A chave para de funcionar se sua conta for removida.
        </p>
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-danger-text">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onBack} disabled={isSubmitting} className={SECONDARY_BUTTON}>
          Voltar
        </button>
        <button type="submit" disabled={isSubmitting} className={PRIMARY_BUTTON}>
          {isSubmitting ? "Criando…" : "Criar chave"}
        </button>
      </div>
    </form>
  );
}

type CopyState = "idle" | "copied" | "failed";

function RevealStep({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
  const [copy, setCopy] = useState<CopyState>("idle");

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopy("copied");
    } catch {
      setCopy("failed"); // ex.: página sem HTTPS ou permissão negada
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Dialog.Title className="text-xl font-bold tracking-tight">Salve sua chave de API</Dialog.Title>
        <Dialog.Description className="text-[15px] leading-relaxed text-ink-body">
          A chave <strong className="font-semibold text-foreground">{created.key.name}</strong>{" "}
          {created.key.expiresAt ? (
            <>
              vence em <strong className="font-semibold text-foreground">{formatLongDate(created.key.expiresAt)}</strong>.
            </>
          ) : (
            "não tem data de validade: vale até ser excluída."
          )}
        </Dialog.Description>
      </div>

      {/* O fio em degradê é o único destaque do fluxo: é aqui que a pessoa não pode errar. */}
      <div className="animate-in rounded-[14px] bg-g-ring p-px duration-500 fade-in-0 zoom-in-[0.98] motion-reduce:animate-none">
        <div className="flex flex-col gap-3 rounded-[13px] bg-popover p-4">
          <span className="flex items-center gap-2 text-[13px] font-semibold text-ink-label">
            <KeyRound className="size-4" aria-hidden />
            Sua chave
          </span>
          <code
            tabIndex={0}
            aria-label="Chave de API"
            onFocus={(event) => getSelection()?.selectAllChildren(event.currentTarget)}
            className="rounded-[8px] font-mono text-[13.5px] leading-relaxed break-all text-foreground outline-none selection:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {created.secret}
          </code>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-ink-body">
        Guarde a chave agora. Por segurança, o SondoHub não mostra ela de novo: se perder, exclua e crie outra.
      </p>

      <p role="status" className={cn("-mt-3 text-sm", copy === "failed" ? "text-danger-text" : "sr-only")}>
        {copy === "copied" && "Chave copiada."}
        {copy === "failed" && "Não deu para copiar. Clique na chave para selecionar e copie com Ctrl+C."}
      </p>

      <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={copySecret} className={SECONDARY_BUTTON}>
          {copy === "copied" ? (
            <Check className="size-4 text-success" strokeWidth={2.4} aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copy === "copied" ? "Copiada" : "Copiar chave"}
        </button>
        <button type="button" onClick={onDone} className={PRIMARY_BUTTON}>
          Concluído
        </button>
      </div>
    </>
  );
}
