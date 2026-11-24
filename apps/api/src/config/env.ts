import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive(),
  HUB_URL: z.url(),
  DATABASE_URL: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1),
  COOKIE_SECURE: z.stringbool(),
  JWT_KEY_ID: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
  AZURE_STORAGE_CONNECTION_STRING: z.string().min(1),
  AZURE_STORAGE_CONTAINER: z.string().min(1),
  GDS_APY_KEY: z.string().min(1),
  EXPERIENCE_API_URL: z.url(),
  EXPERIENCE_API_KEY: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),
  // Assistente de IA: sem o segredo o assistente responde 503 e o resto da API sobe normalmente.
  ASSISTENTE_CHAVE_SECRETA: z.string().min(32).optional(),
  GEMINI_LIVE_MODEL: z.string().min(1).default('models/gemini-3.1-flash-live-preview'),
  GEMINI_SEARCH_MODEL: z.string().min(1).default('gemini-3.8-flash'),
});

export const env = envSchema.parse(process.env);
