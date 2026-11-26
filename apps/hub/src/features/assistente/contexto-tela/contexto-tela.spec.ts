import { describe, expect, it } from "vitest";
import { lerEstadoTela, publicarEstadoTela } from "./contexto-tela-store.ts";

describe("contexto-tela-store", () => {
  it("publica, atualiza e limpa o estado reativo da tela", () => {
    publicarEstadoTela(null);
    expect(lerEstadoTela()).toBeNull();

    publicarEstadoTela({ pagina: "painel_master", periodo: "30d" });
    expect(lerEstadoTela()).toEqual({ pagina: "painel_master", periodo: "30d" });

    publicarEstadoTela(null);
    expect(lerEstadoTela()).toBeNull();
  });
});
