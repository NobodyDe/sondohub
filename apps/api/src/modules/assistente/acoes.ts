/** O que o navegador executa. O servidor só resolve nomes em rotas/slugs; quem age é o navegador. */
export type AcaoCliente = {
  /** Preenchido pela sessão: o navegador devolve `acao_resultado` com este id. */
  id?: string;
  tipo: 'navegar' | 'abrir_app' | 'voltar';
  descricao: string;
  rota?: string;
  slug?: string;
  url?: string;
};

type Tela = { rota: string; nome: string; master: boolean };

export const TELAS: Record<string, Tela> = {
  inicio: { rota: '/', nome: 'o início', master: false },
  perfil: { rota: '/perfil', nome: 'o seu perfil', master: false },
  assistente: { rota: '/assistente', nome: 'as configurações do assistente', master: false },
  painel: { rota: '/admin/painel', nome: 'o painel', master: true },
  usuarios: { rota: '/admin/usuarios', nome: 'os usuários', master: true },
  aplicativos: { rota: '/admin/aplicativos', nome: 'os aplicativos', master: true },
  assistente_admin: { rota: '/admin/assistente', nome: 'a administração do assistente', master: true },
};

export type PedidoAcao = { acao: string; tela: string; app: string };
export type AppAcessivel = { slug: string; name: string; url: string };
export type ResultadoAcao = { texto: string; acao?: AcaoCliente };

export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Resolve o pedido em uma ação (ou em uma explicação do porquê não dá). Não lança. */
export function resolverAcao(p: PedidoAcao, apps: AppAcessivel[], master: boolean): ResultadoAcao {
  if (p.acao === 'voltar') return { texto: 'Voltando.', acao: { tipo: 'voltar', descricao: 'Voltar' } };

  if (p.acao === 'abrir_tela') {
    const tela = TELAS[normalizar(p.tela).replace(/\s+/g, '_')];
    if (!tela) return { texto: `Não conheço essa tela. As telas são: ${Object.keys(TELAS).join(', ')}.` };
    if (tela.master && !master) return { texto: 'Essa tela é só para o Master. Diga isso à pessoa.' };
    return { texto: `Abrindo ${tela.nome}.`, acao: { tipo: 'navegar', descricao: tela.nome, rota: tela.rota } };
  }

  if (p.acao === 'abrir_app') {
    const busca = normalizar(p.app);
    if (!busca) return { texto: 'Qual aplicativo? Veja listar_meus_apps.' };
    const achados = apps.filter((a) => normalizar(a.name).includes(busca) || normalizar(a.slug) === busca);
    if (achados.length === 0) {
      const nomes = apps.map((a) => a.name).join(', ') || 'nenhum';
      return { texto: `Não achei esse aplicativo entre os que a pessoa pode abrir. Ela pode abrir: ${nomes}.` };
    }
    if (achados.length > 1) {
      return { texto: `Achei mais de um: ${achados.map((a) => a.name).join(', ')}. Pergunte qual.` };
    }
    const [app] = achados;
    return {
      texto: `Abrindo ${app.name}.`,
      acao: { tipo: 'abrir_app', descricao: app.name, slug: app.slug, url: app.url },
    };
  }

  return { texto: 'Ação desconhecida. Use abrir_tela, abrir_app ou voltar.' };
}
