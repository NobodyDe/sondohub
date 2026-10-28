import {
  DEFAULT_APP_LEVELS,
  defaultIconUrl,
  type AdminApp,
  type CreateAppInput,
} from "@sondohub/contracts";
import { ApiError } from "@/lib/api.ts";

/** Um app novo: ativo e com os três níveis padrão. */
export const NEW_APP: CreateAppInput = {
  slug: "",
  name: "",
  description: "",
  url: "",
  iconUrl: "",
  levels: DEFAULT_APP_LEVELS,
  isActive: true,
};

/** O app no formato do formulário. Ícone padrão vira campo vazio: se a URL mudar, o ícone acompanha. */
export function toFormValues({
  slug,
  name,
  description,
  url,
  iconUrl,
  levels,
  isActive,
}: AdminApp): CreateAppInput {
  return {
    slug,
    name,
    description,
    url,
    levels,
    isActive,
    iconUrl: iconUrl === defaultIconUrl(url) ? "" : iconUrl,
  };
}

/** O ícone que a prévia mostra. Enquanto a URL não é uma URL, nenhum (sem pedir imagem a cada tecla). */
export function previewIconUrl(url: string, iconUrl: string) {
  if (iconUrl.trim()) return iconUrl.trim();
  return URL.canParse(url) ? defaultIconUrl(url) : "";
}

type FieldConflict = { field: keyof CreateAppInput; message: string };

/** O campo que bateu num 409 da API, ou null se o erro foi outro. */
export function conflictOf(error: unknown): FieldConflict | null {
  return error instanceof ApiError && error.status === 409
    ? (error.body as FieldConflict)
    : null;
}
