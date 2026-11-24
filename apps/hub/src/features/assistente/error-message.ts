import { ApiError } from "../../lib/api.ts";

/** Mensagem do servidor (`{ message }`) quando houver; senão, a padrão. */
export function errorMessage(error: unknown, fallback = "Não deu para concluir. Tente de novo."): string {
  if (error instanceof ApiError) {
    const message = (error.body as { message?: unknown } | null)?.message;
    if (typeof message === "string") return message;
  }
  return fallback;
}
