import type { CreateAppInput } from "@sondohub/contracts";
import { Plus, X } from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";

/** Mesmo limite do schema: mais que isso não cabe no seletor do cadastro de usuário. */
const MAX_LEVELS = 5;

/** Mais permissão, cor mais forte. Do 4 em diante, a mais forte. */
const LEVEL_TONES = [
  "bg-primary-soft text-link",
  "bg-g-azure text-white",
  "bg-g-royal text-white",
  "bg-g-deep text-white",
];

export default function LevelsEditor({
  form,
}: {
  form: UseFormReturn<CreateAppInput>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "levels",
  });
  const errors = form.formState.errors.levels;
  const lastIndex = fields.length - 1;

  return (
    <section aria-labelledby="levels-title" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="levels-title" className="text-lg font-bold">
          Níveis de permissão
        </h2>
        <p className="text-sm text-muted-foreground">
          Número maior, mais permissão. O que cada nível libera, o próprio
          aplicativo decide.
        </p>
      </div>

      <ol className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <li key={field.id} className="flex items-start gap-3">
            <span
              aria-hidden
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-extrabold",
                LEVEL_TONES[Math.min(index, LEVEL_TONES.length - 1)],
              )}
            >
              {index + 1}
            </span>
            <Field data-invalid={!!errors?.[index]?.label} className="flex-1">
              <FieldLabel htmlFor={`level-${index}`} className="sr-only">
                Nome do nível {index + 1}
              </FieldLabel>
              <Input
                id={`level-${index}`}
                aria-invalid={!!errors?.[index]?.label}
                className="h-11 rounded-[10px] bg-background"
                {...form.register(`levels.${index}.label`)}
              />
              <FieldError errors={[errors?.[index]?.label]} />
            </Field>
            {/* Só o último sai: tirar um do meio renumeraria os de cima. */}
            {index === lastIndex && index > 0 ? (
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Remover o nível ${index + 1}`}
                className="flex size-11 shrink-0 items-center justify-center rounded-[10px] text-ink-placeholder transition-colors hover:bg-danger-hover hover:text-danger-text"
              >
                <X className="size-[18px]" aria-hidden />
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden />
            )}
          </li>
        ))}
      </ol>

      <FieldError errors={[errors?.root ?? errors]} />

      {fields.length < MAX_LEVELS && (
        <button
          type="button"
          onClick={() => append({ level: fields.length + 1, label: "" })}
          className="flex h-11 items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-dashed text-sm font-semibold text-ink-nav transition-colors hover:border-line-hover hover:text-foreground"
        >
          <Plus className="size-4" aria-hidden />
          Adicionar nível {fields.length + 1}
        </button>
      )}
    </section>
  );
}
