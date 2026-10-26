import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronLeft } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { Field, FieldError, FieldLabel } from "../../components/ui/field.tsx";
import { Input } from "../../components/ui/input.tsx";
import AdminShell from "./components/AdminShell.tsx";
import AppAccessList from "./components/AppAccessList.tsx";
import RolePicker from "./components/RolePicker.tsx";
import { FAKE_APPS } from "./fake-users.ts";
import { newUserSchema, type NewUserInput } from "./new-user-schema.ts";
import { withGrant } from "./user-access.ts";

export function NewUserPage() {
  const navigate = useNavigate();
  const apps = FAKE_APPS; // Troca por useQuery(GET /api/admin/apps) na integração.
  const form = useForm({
    resolver: zodResolver(newUserSchema),
    defaultValues: { name: "", email: "", role: "USER", apps: [] },
  });
  const { errors, isSubmitting } = form.formState;

  async function onSubmit(input: NewUserInput) {
    console.info("Novo usuário (fake):", input); // Na integração: POST /api/admin/users.
    navigate("/admin/usuarios");
  }

  return (
    <AdminShell>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mx-auto flex max-w-[980px] flex-col gap-8">
        <header className="flex flex-col gap-6">
          <Link
            to="/admin/usuarios"
            className="flex items-center gap-2 self-start rounded-[10px] py-2 pr-3 pl-2 text-sm font-semibold text-ink-nav no-underline transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="size-[18px]" aria-hidden />
            Usuários
          </Link>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Novo usuário</h1>
            <p className="text-[15px] text-muted-foreground">
              A pessoa entra no SondoHub com o e-mail corporativo e vê só os aplicativos liberados aqui.
            </p>
          </div>
        </header>

        <section aria-labelledby="data-title" className="flex flex-col gap-3.5">
          <h2 id="data-title" className="text-lg font-bold">
            Dados
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
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
          </div>
        </section>

        {/* Controller liga ao formulário componentes que não são <input> simples. */}
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => <RolePicker value={field.value} onChange={field.onChange} />}
        />

        <Controller
          control={form.control}
          name="apps"
          render={({ field }) => (
            <AppAccessList
              apps={apps}
              grants={field.value}
              onLevelChange={(app, level) => field.onChange(withGrant(field.value, app.slug, level))}
            />
          )}
        />

        <footer className="flex flex-wrap justify-end gap-2.5 border-t border-line-subtle pt-6">
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
    </AdminShell>
  );
}
