import { emailSchema } from "@sondohub/contracts";
import { z } from "zod";

// Provisório no hub: na integração vai para @sondohub/contracts e a API valida com o mesmo schema.
export const newUserSchema = z.object({
  name: z.string().trim().min(3, "Informe o nome completo.").max(120, "Use no máximo 120 caracteres."),
  email: emailSchema,
  role: z.enum(["MASTER", "ADMIN", "USER"]),
  apps: z.array(z.object({ slug: z.string(), level: z.number().int().positive() })),
});

export type NewUserInput = z.infer<typeof newUserSchema>;
