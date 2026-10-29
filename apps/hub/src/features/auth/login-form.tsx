import { cn } from "cn";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { loginSchema, type LoginInput } from "@sondohub/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { ApiError, hubApi } from "@/lib/api";

const inputClass = "h-11 rounded-[10px] px-3.5 text-[15px] md:text-[15px]";

type LoginFormProps = Omit<React.ComponentProps<"form">, "onSubmit"> & {
  /** Chamado depois do login: decide para onde o usuário segue. */
  onSuccess: () => Promise<void> | void;
};

export function LoginForm({ className, onSuccess, ...props }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const { errors, isSubmitting } = form.formState;

  async function onSubmit(input: LoginInput) {
    try {
      await hubApi.login(input);
      await onSuccess();
    } catch (err) {
      form.setError("root", {
        message:
          err instanceof ApiError && err.status === 401
            ? "Email ou senha inválidos."
            : "Não foi possível entrar. Tente de novo.",
      });
    }
  }

  return (
    <form
      className={cn("flex flex-col gap-8", className)}
      {...props}
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl leading-tight font-bold tracking-[-0.025em]">Entrar no SondoHub</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Use seu e-mail corporativo e senha para acessar todas as aplicações.
        </p>
      </div>

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
            {...form.register("email", {
              onChange: () => form.clearErrors("root"),
            })}
          />
          <FieldError errors={[errors.email]} />
        </Field>

        <Field data-invalid={!!errors.password}>
          <div className="flex items-baseline justify-between gap-3">
            <FieldLabel htmlFor="password" className="font-semibold">
              Senha
            </FieldLabel>
            <a href="#" className="text-sm font-medium hover:underline">
              Esqueceu a senha?
            </a>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="Digite sua senha"
              className={cn(inputClass, "pr-12")}
              aria-invalid={!!errors.password}
              {...form.register("password", {
                onChange: () => form.clearErrors("root"),
              })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="absolute top-0.5 right-0.5 size-10 rounded-lg text-muted-foreground"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? <EyeOff /> : <Eye />}
            </Button>
          </div>
          <FieldError errors={[errors.password]} />
        </Field>

        <Field orientation="horizontal">
          <Checkbox id="trust-device" name="trustDevice" className="mt-0.5 self-start" />
          <FieldContent>
            <FieldLabel htmlFor="trust-device">Confiar neste dispositivo</FieldLabel>
            <FieldDescription className="text-[13px]">
              Mantém você conectado. Use apenas em dispositivos pessoais.
            </FieldDescription>
          </FieldContent>
        </Field>

        <FieldError>{errors.root?.message}</FieldError>

        <Button
          type="submit"
          disabled={isSubmitting}
          className="h-11 rounded-[10px] text-[15px] font-semibold"
        >
          {isSubmitting ? "Entrando..." : "Entrar"}
        </Button>
      </FieldGroup>

      <p className="border-t border-line-divider pt-6 text-[13px] leading-relaxed text-muted-foreground">
        Ao fazer login, você concorda com nossos <a href="#">Termos de Serviço</a> e{" "}
        <a href="#">Política de Privacidade</a>.
      </p>
    </form>
  );
}
