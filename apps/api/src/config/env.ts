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
});

export const env = envSchema.parse(process.env);
