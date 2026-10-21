import { createSondoAuth } from "@sondohub/client";

// Uma instância por app: o access token fica guardado na memória dela.
export const sondo = createSondoAuth({ hubUrl: import.meta.env.VITE_HUB_URL });
