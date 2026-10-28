import { zodResolver } from "@hookform/resolvers/zod";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@sondohub/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { hubApi } from "@/lib/api.ts";

export default function NameForm({ name }: { name: string }) {
  const queryClient = useQueryClient();
  const form = useForm({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name },
  });
  const { errors, isDirty, isSubmitting } = form.formState;

  async function onSubmit(input: UpdateProfileInput) {
    try {
      const updated = await hubApi.updateMyProfile(input);
      form.reset({ name: updated.name }); // o botão volta a ficar desativado até a próxima mudança
      await queryClient.invalidateQueries({ queryKey: ["me"] }); // sidebar, menu e a data de atualização
    } catch {
      form.setError("name", { message: "Não deu para salvar. Tente de novo." });
    }
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-wrap items-start gap-2.5"
    >
      <Field data-invalid={!!errors.name} className="flex-[1_1_260px]">
        <FieldLabel htmlFor="name" className="sr-only">
          Nome completo
        </FieldLabel>
        <Input
          id="name"
          aria-invalid={!!errors.name}
          className="h-11 rounded-[10px] bg-background"
          {...form.register("name")}
        />
        <FieldError errors={[errors.name]} />
      </Field>
      <button
        type="submit"
        disabled={!isDirty || isSubmitting}
        className="h-11 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
      >
        Salvar nome
      </button>
    </form>
  );
}
