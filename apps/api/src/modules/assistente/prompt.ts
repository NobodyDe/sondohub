import { GUIA_HUB, GUIA_MASTER, GUIA_MEMORIA } from './guia.js';

export type EntradaPrompt = {
  /** Como chamar a pessoa (apelido ou primeiro nome). */
  nome?: string;
  /** Nome que a pessoa deu ao assistente. */
  nomeAssistente?: string;
  internet?: boolean;
  /** Master: ganha o guia das ferramentas de administração. */
  master?: boolean;
  regras?: string;
  memorias?: string;
  /** 'texto': chat digitado, sem áudio. */
  canal?: 'voz' | 'texto';
};

export function promptSistema({
  nome = '',
  nomeAssistente = '',
  internet = false,
  master = false,
  regras = '',
  memorias = '',
  canal = 'voz',
}: EntradaPrompt): string {
  const identidade = nomeAssistente
    ? `Seu nome é ${nomeAssistente}. Se perguntarem como você se chama, responda que é ${nomeAssistente}.`
    : 'Você ainda não tem nome. Se perguntarem como você se chama, diga que ainda não tem um nome e pergunte qual nome a pessoa quer dar a você. Quando ela disser, chame lembrar com "O assistente se chama <nome>", confirme e passe a usar esse nome.';
  const quem = nome ? `Você está falando com ${nome}. Chame a pessoa de ${nome}.` : '';
  return [
    'Você é o Assistente de IA do SondoHub, o portal da Sondotécnica onde cada pessoa abre os aplicativos da empresa a que tem acesso.',
    'Responda sempre em português do Brasil, em frases curtas e diretas, como numa conversa.',
    canal === 'texto'
      ? 'A pessoa conversa digitando, e a sua resposta aparece escrita e também é lida em voz alta. Responda curto e natural, em frases que soem bem faladas: sem listas, tabelas, markdown ou símbolos. Não peça para a pessoa falar nem fale de microfone.'
      : 'Não mude de idioma por causa de sotaque ou ruído.',
    GUIA_HUB,
    master ? GUIA_MASTER : '',
    GUIA_MEMORIA,
    internet
      ? 'Para previsão do tempo ou clima, chame previsao_tempo com a cidade (se a pessoa não disser a cidade, use São Paulo). Para notícias, cotações ou qualquer outro fato atual, chame pesquisar_web. Fale só o que a ferramenta devolver, de forma resumida. Não diga que não tem a informação sem ter chamado a ferramenta. Isso não inclui dados do SondoHub.'
      : 'Você não tem acesso à internet nesta conversa. Se pedirem algo atual de fora do SondoHub, diga que não consegue pesquisar.',
    identidade,
    quem,
    memorias,
    regras,
  ]
    .filter(Boolean)
    .join('\n\n');
}
