import { zodResolver } from "@hookform/resolvers/zod";
import { createUserSchema } from "@sondohub/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import BackLink from "@/components/BackLink.tsx";
import { Field, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ApiError, hubApi } from "@/lib/api.ts";
import AppAccessList from "../../shared/AppAccessList.tsx";
import { withGrant } from "../../shared/user-access.ts";
import RolePicker from "../components/RolePicker.tsx";
import { z } from "zod";
import PasswordStrength from "../components/PasswordStrength.tsx";

const newUserFormSchema = createUserSchema
  .extend({ confirmPassword: z.string() })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não batem.",
    path: ["confirmPassword"], // o erro aparece embaixo do segundo campo
  });
type NewUserForm = z.infer<typeof newUserFormSchema>;

export function NewUserPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: apps = [] } = useQuery({
    queryKey: ["admin", "apps"],
    queryFn: hubApi.adminApps,
    select: (all) => all.filter((app) => app.isActive), // app inativo não se libera para ninguém.
  });
  const form = useForm({
    resolver: zodResolver(newUserFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "USER",
      apps: [],
    },
  });
  const password = useWatch({ control: form.control, name: "password" });
  const [showPassword, setShowPassword] = useState(false);
  const { errors, isSubmitting } = form.formState;

  async function onSubmit({ confirmPassword: _confirmPassword, ...input }: NewUserForm) {
    try {
      await hubApi.createAdminUser(input);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409)
        return form.setError("email", {
          message: "Já existe um usuário com esse e-mail.",
        });
      return form.setError("root", {
        message: "Não deu para criar o usuário. Tente de novo.",
      });
    }

    await queryClient.invalidateQueries({ queryKey: ["admin", "users"] }); // a lista volta com ele.
    navigate("/admin/usuarios");
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="mx-auto flex max-w-[980px] flex-col gap-8"
    >
      <header className="flex flex-col gap-6">
        <BackLink to="/admin/usuarios" label="Usuários" />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">
            Novo usuário
          </h1>
          <p className="text-[15px] text-muted-foreground">
            A pessoa entra no SondoHub com o e-mail corporativo e vê só os
            aplicativos liberados aqui.
          </p>
        </div>
      </header>

      <section aria-labelledby="data-title" className="flex flex-col gap-3.5">
        <h2 id="data-title" className="text-lg font-bold">
          Dados
        </h2>
        {/* 2 colunas: nome e e-mail em cima, senha e confirmação embaixo. No celular, uma só. */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Nome completo</FieldLabel>
            <Input
              id="name"
              placeholder="Ex.: Maria Oliveira"
              aria-invalid={!!errors.name}
              className="h-11 rounded-[10px] bg-background"
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">E-mail corporativo</FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="nome@sondotecnica.com.br"
              aria-invalid={!!errors.email}
              className="h-11 rounded-[10px] bg-background"
              {...form.register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Senha</FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                aria-invalid={!!errors.password}
                className="h-11 rounded-[10px] bg-background pr-11"
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirmPassword}>
            <FieldLabel htmlFor="confirmPassword">Confirme a senha</FieldLabel>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              className="h-11 rounded-[10px] bg-background"
              {...form.register("confirmPassword")}
            />
            <FieldError errors={[errors.confirmPassword]} />
          </Field>
        </div>
      </section>

      {/* Controller liga ao formulário componentes que não são <input> simples. */}
      <Controller
        control={form.control}
        name="role"
        render={({ field }) => (
          <RolePicker value={field.value} onChange={field.onChange} />
        )}
      />

      <Controller
        control={form.control}
        name="apps"
        render={({ field }) => (
          <AppAccessList
            apps={apps}
            grants={field.value}
            onLevelChange={(app, level) =>
              field.onChange(withGrant(field.value, app.slug, level))
            }
          />
        )}
      />

      <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line-subtle pt-6">
        {errors.root && (
          <p
            role="alert"
            className="mr-auto self-center text-sm font-semibold text-danger-text"
          >
            {errors.root.message}
          </p>
        )}
        <Link
          to="/admin/usuarios"
          className="flex h-11 items-center rounded-[10px] border border-input px-5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-secondary"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-[10px] bg-primary px-6 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
        >
          Criar usuário
        </button>
      </footer>
    </form>
  );
}
