import { Type, type FunctionDeclaration } from '@google/genai';

export type Ferramenta = FunctionDeclaration & { name: string };

// ── Internet ────────────────────────────────────────────────────────────────

export const FERRAMENTA_BUSCA: Ferramenta = {
  name: 'pesquisar_web',
  description:
    'Busca na internet fatos atuais: clima, previsão do tempo, notícias, cotações, placares, horários. Chame antes de dizer que não tem a informação.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      consulta: {
        type: Type.STRING,
        description: 'Consulta específica, com cidade e o que se quer (ex.: previsão do tempo em São Paulo hoje).',
      },
    },
    required: ['consulta'],
  },
};

export const FERRAMENTA_CLIMA: Ferramenta = {
  name: 'previsao_tempo',
  description:
    'Previsão do tempo de uma cidade: agora e próximos dias (temperatura, chuva, céu). Use sempre que pedirem clima ou previsão.',
  parameters: {
    type: Type.OBJECT,
    properties: { cidade: { type: Type.STRING, description: 'Nome da cidade (ex.: São Paulo).' } },
    required: ['cidade'],
  },
};

export const FERRAMENTAS_INTERNET = [FERRAMENTA_BUSCA, FERRAMENTA_CLIMA];

// ── Memória ─────────────────────────────────────────────────────────────────

export const FERRAMENTA_LEMBRAR: Ferramenta = {
  name: 'lembrar',
  description: 'Guarda um fato ou preferência da pessoa para as próximas conversas.',
  parameters: {
    type: Type.OBJECT,
    properties: { texto: { type: Type.STRING, description: 'Frase curta e clara do que lembrar.' } },
    required: ['texto'],
  },
};

export const FERRAMENTA_ESQUECER: Ferramenta = {
  name: 'esquecer',
  description: 'Apaga as memórias da pessoa que contêm o trecho informado.',
  parameters: {
    type: Type.OBJECT,
    properties: { trecho: { type: Type.STRING, description: 'Trecho do que deve ser esquecido.' } },
    required: ['trecho'],
  },
};

export const FERRAMENTA_LISTAR_MEMORIAS: Ferramenta = {
  name: 'listar_memorias',
  description:
    'Lê, agora, tudo o que a pessoa pediu para você lembrar (instruções e preferências salvas), direto do cadastro. Chame quando pedirem para rever, lembrar ou conferir a memória, ou antes de agir quando houver dúvida sobre uma instrução salva. A lista pode ter mudado desde o início da conversa.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const FERRAMENTAS_MEMORIA = [FERRAMENTA_LEMBRAR, FERRAMENTA_ESQUECER, FERRAMENTA_LISTAR_MEMORIAS];

// ── Tela ────────────────────────────────────────────────────────────────────

export const FERRAMENTA_VER_TELA: Ferramenta = {
  name: 'ver_tela',
  description:
    'Mostra em que tela do SondoHub a pessoa está agora. Chame quando ela disser "isso", "aqui", "essa tela" ou "onde estou".',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const FERRAMENTA_ACAO: Ferramenta = {
  name: 'acao_tela',
  description:
    'Controla o SondoHub no navegador: abre uma tela, abre um aplicativo ou volta à tela anterior. Use quando a pessoa pedir "abre", "me leva", "vai para", "volta".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      acao: { type: Type.STRING, description: 'abrir_tela, abrir_app ou voltar.' },
      tela: {
        type: Type.STRING,
        description:
          'abrir_tela: inicio (lista de aplicativos), perfil, assistente (configurações do assistente) ou, só para o Master: painel, usuarios, aplicativos, assistente_admin.',
      },
      app: {
        type: Type.STRING,
        description: 'abrir_app: nome (ou parte do nome) do aplicativo, como a pessoa falou. Veja listar_meus_apps.',
      },
    },
    required: ['acao'],
  },
};

export const FERRAMENTAS_TELA = [FERRAMENTA_VER_TELA, FERRAMENTA_ACAO];

// ── Domínio do hub: o que cada pessoa vê ────────────────────────────────────

export const FERRAMENTA_MEUS_APPS: Ferramenta = {
  name: 'listar_meus_apps',
  description:
    'Lista os aplicativos que a pessoa pode abrir no SondoHub, com o que cada um faz e o nível de acesso dela em cada um.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const FERRAMENTA_MEU_PERFIL: Ferramenta = {
  name: 'meu_perfil',
  description: 'Dados da conta da própria pessoa: nome, e-mail, cargo e os dispositivos conectados agora.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const FERRAMENTA_CONSULTAR_APP_FILHO: Ferramenta = {
  name: 'consultar_app_filho',
  description:
    'Consulta em tempo real informações de dentro de um aplicativo filho da Sondotécnica (como SondoView, Gêmeo Digital ou Experience) ao qual a pessoa tem acesso.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      app: {
        type: Type.STRING,
        description: 'Nome ou slug do aplicativo (ex.: SondoView, Gêmeo Digital, Experience).',
      },
      consulta: {
        type: Type.STRING,
        description: 'Pergunta ou resumo desejado dentro daquele aplicativo (ex.: avanço das obras, eventos ativos, contratos).',
      },
    },
    required: ['app', 'consulta'],
  },
};

export const FERRAMENTAS_HUB = [FERRAMENTA_MEUS_APPS, FERRAMENTA_MEU_PERFIL, FERRAMENTA_CONSULTAR_APP_FILHO];

// ── Só Master: as mesmas informações das telas /admin ───────────────────────

export const FERRAMENTA_PAINEL: Ferramenta = {
  name: 'resumo_painel',
  description:
    'Painel do Master: usuários ativos e total, logins no período contra o período anterior, sessões abertas agora, aplicativos mais usados e pontos de atenção (inativos, sem aplicativo).',
  parameters: {
    type: Type.OBJECT,
    properties: { periodo: { type: Type.STRING, description: '7d, 30d, 90d ou 12m. Padrão 30d.' } },
  },
};

export const FERRAMENTA_RESUMO_USUARIOS: Ferramenta = {
  name: 'resumo_usuarios',
  description: 'Quantos usuários existem no total e quantos são Master e Administrador.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const FERRAMENTA_BUSCAR_USUARIOS: Ferramenta = {
  name: 'buscar_usuarios',
  description: 'Procura usuários pelo nome ou e-mail (até 5 resultados), com cargo e aplicativos de cada um.',
  parameters: {
    type: Type.OBJECT,
    properties: { busca: { type: Type.STRING, description: 'Parte do nome ou do e-mail.' } },
    required: ['busca'],
  },
};

export const FERRAMENTA_DETALHE_USUARIO: Ferramenta = {
  name: 'detalhe_usuario',
  description:
    'Detalhe de um usuário: cargo, se está ativo e em quais aplicativos ele entra, com o nível. Se a busca achar mais de um, devolve a lista para a pessoa escolher.',
  parameters: {
    type: Type.OBJECT,
    properties: { busca: { type: Type.STRING, description: 'Nome ou e-mail do usuário.' } },
    required: ['busca'],
  },
};

export const FERRAMENTA_PROPOR_ALTERACAO: Ferramenta = {
  name: 'propor_alteracao_usuario',
  description:
    'Prepara uma alteração administrativa em um usuário (liberar aplicativo, remover aplicativo, autorizar uso do assistente, alterar cargo ou ativar/desativar conta) e mostra um cartão de confirmação visual na tela para o Master aprovar.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      operacao: {
        type: Type.STRING,
        description:
          'liberar_app (concede acesso ou troca o nível em um app), remover_app (tira acesso a um app), autorizar_assistente (liga ou desliga uso do assistente), alterar_cargo (troca para Usuário, Administrador ou Master) ou alterar_status (ativa ou desativa a conta).',
      },
      usuario: {
        type: Type.STRING,
        description:
          'Nome ou e-mail do usuário. Se o Master estiver na ficha do usuário na tela e disser "esse usuário", "ele" ou "ela", passe "esse".',
      },
      app: {
        type: Type.STRING,
        description: 'Para liberar_app e remover_app: nome ou slug do aplicativo (ex.: Gêmeo Digital, Experience).',
      },
      valor: {
        type: Type.STRING,
        description:
          'Para liberar_app: número ou nome do nível (ex.: 1, 2, Administrador, Usuário). Para alterar_cargo: Usuário, Administrador ou Master. Para autorizar_assistente e alterar_status: sim ou nao.',
      },
    },
    required: ['operacao'],
  },
};

export const FERRAMENTAS_MASTER = [
  FERRAMENTA_PAINEL,
  FERRAMENTA_RESUMO_USUARIOS,
  FERRAMENTA_BUSCAR_USUARIOS,
  FERRAMENTA_DETALHE_USUARIO,
  FERRAMENTA_PROPOR_ALTERACAO,
];

/** Nomes que só o Master pode chamar: o servidor confere, não basta esconder do catálogo. */
export const NOMES_SO_MASTER: ReadonlySet<string> = new Set(FERRAMENTAS_MASTER.map((f) => f.name));
