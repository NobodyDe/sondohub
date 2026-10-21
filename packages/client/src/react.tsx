import type { SondoUser } from "@sondohub/contracts";
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { NoAccessError, type SondoAuth } from "./create-sondo-auth.js";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; user: SondoUser }
  | { kind: "no-access" }
  | { kind: "error" };

type SondoContextValue = { auth: SondoAuth; user: SondoUser };

const SondoAuthContext = createContext<SondoContextValue | null>(null);

type SondoAuthProviderProps = {
  auth: SondoAuth;
  children: ReactNode;
  /** O que mostrar enquanto a sessão não chega do hub. */
  loading?: ReactNode;
};

export function SondoAuthProvider({
  auth,
  children,
  loading = null,
}: SondoAuthProviderProps) {
  const [status, setStatus] = useState<Status>({ kind: "loading" });

  useEffect(() => {
    // Sem sessão no hub, o SDK já redireciona para o login: aqui só tratamos 403 e falhas.
    auth.getSession().then(
      ({ user }) => setStatus({ kind: "ready", user }),
      (error) =>
        setStatus({
          kind: error instanceof NoAccessError ? "no-access" : "error",
        }),
    );
  }, [auth]);

  if (status.kind === "loading") return loading;
  if (status.kind === "no-access")
    return (
      <Notice
        hubUrl={auth.hubUrl}
        text="Você não tem acesso a este aplicativo."
      />
    );
  if (status.kind === "error")
    return (
      <Notice
        hubUrl={auth.hubUrl}
        text="Não foi possível falar com o SondoHub."
      />
    );
  return (
    <SondoAuthContext value={{ auth, user: status.user }}>
      {children}
    </SondoAuthContext>
  );
}

/** O cliente e o usuário do Provider mais próximo (o widget usa por dentro). */
export function useSondoContext(): SondoContextValue {
  const value = use(SondoAuthContext);
  if (!value) throw new Error("Use dentro de <SondoAuthProvider>");
  return value;
}

export function useSondoAuth() {
  const { auth, user } = useSondoContext();
  return { user, getAccessToken: auth.getAccessToken, logout: auth.logout };
}

function Notice({ hubUrl, text }: { hubUrl: string; text: string }) {
  return (
    <div
      style={{
        padding: 32,
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <p>{text}</p>
      <a href={hubUrl}>Ir para a central</a>
    </div>
  );
}
