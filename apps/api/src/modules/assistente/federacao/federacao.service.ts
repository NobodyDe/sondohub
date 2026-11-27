import { Injectable, Logger } from '@nestjs/common';
import { normalizar } from '../acoes.js';
import { AssistenteConsultas, type AppDaPessoa } from '../consultas.js';
import {
  TIMEOUT_FEDERACAO_MS,
  type ContextoUsuarioFederado,
  type PayloadFederado,
  type PedidoConsultaAppFilho,
  type RespostaHttpAppFilho,
} from './federacao.types.js';

type EndpointFederado = { apiUrl: string; apiKey: string };

/**
 * Resolve a URL base e a chave `X-Api-Key` de um aplicativo filho.
 * Aceita variáveis dedicadas `<SLUG>_API_URL` / `<SLUG>_API_KEY` e reaproveita as já existentes do Gêmeo e Experience.
 */
export function resolverEndpointAppFilho(
  slug: string,
  variaveis: Record<string, string | undefined> = process.env,
): EndpointFederado | null {
  const prefixo = slug.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const urlDireta = variaveis[`${prefixo}_API_URL`]?.trim();
  const chaveDireta = variaveis[`${prefixo}_API_KEY`]?.trim();
  if (urlDireta && chaveDireta) return { apiUrl: urlDireta.replace(/\/+$/, ''), apiKey: chaveDireta };

  if (slug === 'gemeo') {
    const apiKey = variaveis.GDS_APY_KEY?.trim() || variaveis.GEMEO_API_KEY?.trim();
    const emDevLocal = Boolean(variaveis.HUB_URL?.includes('localhost'));
    const padraoGemeo = emDevLocal ? 'http://localhost:3030' : 'https://gds-techlab.sondotecnica.com';
    const apiUrl = (variaveis.GEMEO_API_URL?.trim() || padraoGemeo).replace(/\/+$/, '');
    return apiKey ? { apiUrl, apiKey } : null;
  }

  if (slug === 'experience') {
    const apiUrl = variaveis.EXPERIENCE_API_URL?.trim()?.replace(/\/+$/, '');
    const apiKey = variaveis.EXPERIENCE_API_KEY?.trim();
    return apiUrl && apiKey ? { apiUrl, apiKey } : null;
  }

  return null;
}

/**
 * Federação estilo MCP HTTP entre o Assistente do SondoHub (Host) e os aplicativos filhos (SondoView, Gêmeo, Experience).
 * Garante que o usuário só consulte aplicativos aos quais tem acesso ativo no Hub e repassa sua identidade (`X-Hub-User-Id`).
 */
@Injectable()
export class AssistenteFederacaoService {
  private readonly logger = new Logger(AssistenteFederacaoService.name);

  constructor(private readonly consultas: AssistenteConsultas) {}

  async consultarAppFilho(
    user: ContextoUsuarioFederado,
    pedido: PedidoConsultaAppFilho,
    fetcher: typeof fetch = fetch,
    variaveis: Record<string, string | undefined> = process.env,
  ): Promise<string> {
    const busca = normalizar(pedido.app);
    const pergunta = pedido.consulta.trim().slice(0, 500);
    if (!busca) return 'Diga qual aplicativo deseja consultar (ex.: SondoView, Gêmeo Digital, Experience).';
    if (!pergunta) return 'Diga o que deseja consultar nesse aplicativo.';

    const apps = await this.consultas.appsDaPessoa(user.id);
    const achados = apps.filter((a) => normalizar(a.name).includes(busca) || normalizar(a.slug) === busca);

    if (achados.length === 0) {
      const disponiveis = apps.map((a) => a.name).join(', ') || 'nenhum';
      return `A pessoa não tem acesso a "${pedido.app}". Aplicativos liberados para ela: ${disponiveis}.`;
    }
    if (achados.length > 1) {
      return `Mais de um aplicativo combina com "${pedido.app}": ${achados.map((a) => a.name).join(', ')}. Pergunte qual.`;
    }

    const [app] = achados;
    const endpoint = resolverEndpointAppFilho(app.slug, variaveis);
    if (!endpoint) {
      return this.respostaFallback(app);
    }

    const url = `${endpoint.apiUrl}/sondohub/assistant/query`;
    const payload: PayloadFederado = {
      hubUserId: user.id,
      email: user.email,
      name: user.name,
      level: app.level,
      levelLabel: app.levelLabel,
      query: pergunta,
    };

    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': endpoint.apiKey,
          'x-hub-user-id': user.id,
          'x-hub-user-email': user.email,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_FEDERACAO_MS),
      });

      if (!res.ok) {
        this.logger.warn(`consulta federada em ${app.slug} respondeu HTTP ${res.status}`);
        return this.respostaFallback(app);
      }

      const corpo = (await res.json()) as RespostaHttpAppFilho;
      const textoRemoto = (corpo.texto ?? corpo.text ?? '').trim();
      if (!textoRemoto) return this.respostaFallback(app);

      return `[${app.name}] ${textoRemoto}`;
    } catch (error) {
      this.logger.warn(`falha ao consultar app filho ${app.slug}: ${(error as Error).message}`);
      return this.respostaFallback(app);
    }
  }

  private respostaFallback(app: AppDaPessoa): string {
    const nivel = app.levelLabel ?? String(app.level);
    return (
      `A pessoa tem acesso ativo ao ${app.name} (nível ${nivel}: ${app.description}), ` +
      `mas o canal de consulta em tempo real desse aplicativo não respondeu agora. ` +
      `Ofereça abrir o ${app.name} na tela com acao_tela (abrir_app).`
    );
  }
}
