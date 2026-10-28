import { zodResolver } from "@hookform/resolvers/zod";
import {
  APP_DESCRIPTION_MAX,
  createAppSchema,
  type CreateAppInput,
} from "@sondohub/contracts";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link } from "react-router";
import Switch from "@/components/Switch.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { conflictOf } from "../app-form.ts";
import AppPreview from "./AppPreview.tsx";
import LevelsEditor from "./LevelsEditor.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

type AppFormProps = {
  defaultValues: CreateAppInput;
  isEditing: boolean;
  submitLabel: string;
  /** Grava. Se lançar erro, o formulário mostra a mensagem e continua preenchido. */
  onSubmit: (input: CreateAppInput) => Promise<void>;
};

const INPUT_CLASS = "h-11 rounded-[10px] bg-background";

export default function AppForm({
  defaultValues,
  isEditing,
  submitLabel,
  onSubmit,
}: AppFormProps) {
  const form = useForm({
    resolver: zodResolver(createAppSchema),
    defaultValues,
  });
  const { errors, isSubmitting } = form.formState;
  const description = useWatch({ control: form.control, name: "description" });

  async function submit(input: CreateAppInput) {
    try {
      await onSubmit(input);
    } catch (error) {
      const conflict = conflictOf(error);
      if (conflict)
        return form.setError(conflict.field, { message: conflict.message });
      form.setError("root", {
        message: "Não deu para salvar o aplicativo. Tente de novo.",
      });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      noValidate
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div className="flex flex-col gap-8">
        <section aria-labelledby="data-title" className="flex flex-col gap-3.5">
          <h2 id="data-title" className="text-lg font-bold">
            Dados
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">Nome</FieldLabel>
              <Input
                id="name"
                placeholder="Ex.: Gêmeo Digital"
                aria-invalid={!!errors.name}
                className={INPUT_CLASS}
                {...form.register("name")}
              />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field data-invalid={!!errors.slug}>
              <FieldLabel htmlFor="slug">Identificador</FieldLabel>
              {/* readOnly, não disabled: input disabled sai do submit como undefined e o schema recusa. */}
              <Input
                id="slug"
                placeholder="Ex.: gemeo-digital"
                readOnly={isEditing}
                aria-invalid={!!errors.slug}
                className={cn(
                  INPUT_CLASS,
                  isEditing && "bg-field-readonly text-muted-foreground",
                )}
                {...form.register("slug")}
              />
              <FieldDescription>
                {isEditing
                  ? "Não muda depois de criado."
                  : "Letras minúsculas, números e hífen. Não muda depois."}
              </FieldDescription>
              <FieldError errors={[errors.slug]} />
            </Field>
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="description">Descrição</FieldLabel>
              <Textarea
                id="description"
                rows={3}
                maxLength={APP_DESCRIPTION_MAX}
                placeholder="Ex.: Plataforma de monitoramento inteligente"
                aria-invalid={!!errors.description}
                className="resize-none rounded-[10px] bg-background"
                {...form.register("description")}
              />
              <FieldDescription>
                {description.length}/{APP_DESCRIPTION_MAX} caracteres. Aparece
                no card do launcher.
              </FieldDescription>
              <FieldError errors={[errors.description]} />
            </Field>
          </div>
        </section>

        <section
          aria-labelledby="address-title"
          className="flex flex-col gap-3.5"
        >
          <h2 id="address-title" className="text-lg font-bold">
            Endereço
          </h2>
          <Field data-invalid={!!errors.url}>
            <FieldLabel htmlFor="url">URL do aplicativo</FieldLabel>
            <Input
              id="url"
              type="url"
              placeholder="https://gemeo.sondotecnica.com.br"
              aria-invalid={!!errors.url}
              className={INPUT_CLASS}
              {...form.register("url")}
            />
            <FieldDescription>
              O login pelo SondoHub fica liberado só para este endereço.
            </FieldDescription>
            <FieldError errors={[errors.url]} />
          </Field>
          <Field data-invalid={!!errors.iconUrl}>
            <FieldLabel htmlFor="iconUrl">URL do ícone</FieldLabel>
            <Input
              id="iconUrl"
              type="url"
              placeholder="Vazio usa o favicon.svg do aplicativo"
              aria-invalid={!!errors.iconUrl}
              className={INPUT_CLASS}
              {...form.register("iconUrl")}
            />
            <FieldError errors={[errors.iconUrl]} />
          </Field>
        </section>

        <LevelsEditor form={form} />

        <Controller
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <section className="flex items-center justify-between gap-4 rounded-[14px] border border-line-subtle p-5">
              <div className="flex flex-col gap-1">
                <span className="text-base font-bold">
                  Disponível para as pessoas
                </span>
                <span className="text-[13px] text-muted-foreground">
                  Desligado, o app some do launcher e o SondoHub para de fazer
                  login nele.
                </span>
              </div>
              <Switch
                checked={field.value}
                onCheckedChange={field.onChange}
                label="Disponível para as pessoas"
              />
            </section>
          )}
        />
      </div>

      <AppPreview control={form.control} />

      <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line-subtle pt-6 lg:col-span-2">
        {errors.root && (
          <p
            role="alert"
            className="mr-auto self-center text-sm font-semibold text-danger-text"
          >
            {errors.root.message}
          </p>
        )}
        <Link
          to="/admin/aplicativos"
          className="flex h-11 items-center rounded-[10px] border border-input px-5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-secondary"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-[10px] bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </footer>
    </form>
  );
}
