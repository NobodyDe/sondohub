import { describe, expect, it } from "vitest";
import { lerAcao } from "./executar-acoes.ts";

describe("lerAcao", () => {
  it("aceita navegar para rota do hub", () => {
    expect(lerAcao({ id: "a1", tipo: "navegar", rota: "/perfil", descricao: "o perfil" })).toMatchObject({
      tipo: "navegar",
      rota: "/perfil",
      id: "a1",
    });
  });

  it("recusa rota externa ou protocolo-relativa", () => {
    for (const rota of ["https://evil.com", "//evil.com", `/${String.fromCharCode(92)}evil.com`, "perfil", undefined]) {
      expect(lerAcao({ tipo: "navegar", rota })).toBeNull();
    }
  });

  it("abrir_app exige slug e url http(s)", () => {
    expect(lerAcao({ tipo: "abrir_app", slug: "g", url: "https://g.exemplo" })).toMatchObject({ slug: "g" });
    expect(lerAcao({ tipo: "abrir_app", slug: "g", url: "javascript:alert(1)" })).toBeNull();
    expect(lerAcao({ tipo: "abrir_app", slug: "g", url: "nao é url" })).toBeNull();
    expect(lerAcao({ tipo: "abrir_app", url: "https://g.exemplo" })).toBeNull();
  });

  it("voltar passa; tipo desconhecido e lixo viram null", () => {
    expect(lerAcao({ tipo: "voltar" })).toMatchObject({ tipo: "voltar" });
    expect(lerAcao({ tipo: "apagar" })).toBeNull();
    expect(lerAcao(null)).toBeNull();
    expect(lerAcao("x")).toBeNull();
  });
});
