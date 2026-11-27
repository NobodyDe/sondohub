import type { AssistentePropostaResumo } from "@sondohub/contracts";

export type StatusCardProposta = "pendente" | "confirmando" | "confirmada" | "cancelada" | "erro";

export type CardPropostaItem = {
  proposta: AssistentePropostaResumo;
  status: StatusCardProposta;
  mensagemResultado?: string;
};
