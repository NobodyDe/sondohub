import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { AssistenteConfigResposta } from '@sondohub/contracts';
import type { AuthContext } from '../../common/auth/auth-context.js';
import { CurrentAuth } from '../../common/auth/current-auth.decorator.js';
import { MasterGuard } from '../../common/auth/master.guard.js';
import { SessionGuard } from '../../common/auth/session.guard.js';
import { AssistenteRepository, type EscopoRegra } from './assistente.repository.js';
import { lerEntradaMemoria } from './memorias.js';
import { lerEntradaPergunta } from './perguntas.js';
import { lerEntradaRegra } from './regras.js';
import { assistenteAtivo, lerAlteracao, VOZES, type ConfigAssistente } from './tipos.js';
import { validarChaveGemini } from './validar-chave.js';

const SEM_PERMISSAO = 'O uso do assistente não está liberado para o seu usuário. Peça ao administrador.';

const segredoConfigurado = () => Boolean(process.env.ASSISTENTE_CHAVE_SECRETA?.trim());

/** Falta o segredo que criptografa as chaves: nada que toque em chave pode funcionar. */
function exigirSegredo() {
  if (!segredoConfigurado()) throw new ServiceUnavailableException('O assistente não está configurado no servidor.');
}

function resposta(
  config: ConfigAssistente,
  podeEditar: boolean,
  chavePropria: boolean,
  autorizado: boolean,
): AssistenteConfigResposta {
  return {
    autorizado,
    // Liga com a chave da empresa ou com a do próprio usuário, e só se o Master autorizou o usuário.
    habilitado: segredoConfigurado() && autorizado && assistenteAtivo(config, chavePropria),
    chavePropriaConfigurada: chavePropria,
    habilitadoConfig: config.habilitado,
    voz: config.voz,
    vozes: VOZES,
    internet: config.internet,
    nome: config.nome,
    apelido: config.apelido,
    modoMic: config.modoMic,
    chatTexto: config.chatTexto,
    preferencia: config.preferencia,
    chaveConfigurada: config.chaveConfigurada,
    podeEditar,
  };
}

const invalido = (mensagem = 'Dados inválidos.') => new BadRequestException(mensagem);

@Controller('assistente')
@UseGuards(SessionGuard)
export class AssistenteController {
  constructor(private readonly repo: AssistenteRepository) {}

  private async estado({ user }: AuthContext) {
    const [config, chavePropria, autorizado] = await Promise.all([
      this.repo.lerConfigUsuario(user.id),
      this.repo.temChavePropria(user.id),
      this.repo.usuarioPodeUsar(user),
    ]);
    return resposta(config, user.role === 'MASTER', chavePropria, autorizado);
  }

  @Get('config')
  config(@CurrentAuth() auth: AuthContext) {
    return this.estado(auth);
  }

  @Get('config/chave')
  @UseGuards(MasterGuard)
  @Header('Cache-Control', 'no-store')
  async chaveGlobal() {
    exigirSegredo();
    return { chave: (await this.repo.lerChaveGlobal()) ?? '' };
  }

  /** Global (Master): só a chave do Gemini que vale para quem não tem chave própria. */
  @Put('config')
  @UseGuards(MasterGuard)
  async gravarChaveGlobal(@CurrentAuth() auth: AuthContext, @Body() corpo: unknown) {
    const alteracao = lerAlteracao(corpo);
    if (!alteracao || alteracao.apiKey === undefined) throw invalido();
    exigirSegredo();
    await this.repo.gravarChaveGlobal(alteracao.apiKey, auth.user.id);
    return this.estado(auth);
  }

  /** Pessoal: ligar, voz, internet, nome, apelido, modo do microfone, chat. */
  @Put('preferencias')
  async preferencias(@CurrentAuth() auth: AuthContext, @Body() corpo: unknown) {
    const alteracao = lerAlteracao(corpo);
    if (!alteracao) throw invalido();
    delete alteracao.apiKey;
    if (alteracao.habilitado === true && !(await this.repo.usuarioPodeUsar(auth.user))) {
      throw new ForbiddenException(SEM_PERMISSAO);
    }
    await this.repo.gravarPreferencias(auth.user.id, alteracao);
    return this.estado(auth);
  }

  /** Chave própria: só o dono a lê (para copiar). */
  @Get('chave-propria')
  @Header('Cache-Control', 'no-store')
  async chavePropria(@CurrentAuth() { user }: AuthContext) {
    exigirSegredo();
    return { chave: (await this.repo.lerChavePropria(user.id)) ?? '' };
  }

  @Put('chave-propria')
  async gravarChavePropria(@CurrentAuth() auth: AuthContext, @Body() corpo: { apiKey?: unknown }) {
    const apiKey = typeof corpo?.apiKey === 'string' ? corpo.apiKey.trim() : null;
    if (apiKey === null || apiKey.length > 200) throw invalido();
    if (apiKey !== '' && !(await this.repo.usuarioPodeUsar(auth.user))) throw new ForbiddenException(SEM_PERMISSAO);
    exigirSegredo();
    await this.repo.gravarChavePropria(auth.user.id, apiKey);
    return this.estado(auth);
  }

  /** Valida a chave digitada ou, sem `apiKey`, a salva (`escopo` 'global' só para o Master). */
  @Post('validar-chave')
  @HttpCode(200)
  async validarChave(@CurrentAuth() { user }: AuthContext, @Body() corpo: { apiKey?: unknown; escopo?: unknown }) {
    const { apiKey, escopo } = corpo ?? {};
    if ((apiKey !== undefined && typeof apiKey !== 'string') || (escopo !== 'global' && escopo !== 'propria')) {
      throw invalido();
    }
    if (escopo === 'global' && user.role !== 'MASTER') throw new ForbiddenException();
    const digitada = apiKey?.trim();
    if (!digitada) exigirSegredo();
    const chave =
      digitada || (escopo === 'global' ? await this.repo.lerChaveGlobal() : await this.repo.lerChavePropria(user.id));
    return chave ? validarChaveGemini(chave) : { valida: false, mensagem: 'Nenhuma chave salva.' };
  }

  // ── Regras: pessoais (cada um as suas) e da empresa (Master) ───────────────

  @Get('regras')
  async regras(@CurrentAuth() { user }: AuthContext) {
    return { regras: await this.repo.listarRegras(user.id) };
  }

  @Post('regras')
  criarRegra(@CurrentAuth() { user }: AuthContext, @Body() corpo: unknown) {
    return this.criarRegraEm(user.id, user.id, corpo);
  }

  @Patch('regras/:id')
  editarRegra(@CurrentAuth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() corpo: unknown) {
    return this.editarRegraEm(user.id, user.id, id, corpo);
  }

  @Delete('regras/:id')
  @HttpCode(204)
  removerRegra(@CurrentAuth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.removerRegra(user.id, id);
  }

  @Get('regras-globais')
  @UseGuards(MasterGuard)
  async regrasGlobais() {
    return { regras: await this.repo.listarRegras(null) };
  }

  @Post('regras-globais')
  @UseGuards(MasterGuard)
  criarRegraGlobal(@CurrentAuth() { user }: AuthContext, @Body() corpo: unknown) {
    return this.criarRegraEm(null, user.id, corpo);
  }

  @Patch('regras-globais/:id')
  @UseGuards(MasterGuard)
  editarRegraGlobal(
    @CurrentAuth() { user }: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: unknown,
  ) {
    return this.editarRegraEm(null, user.id, id, corpo);
  }

  @Delete('regras-globais/:id')
  @UseGuards(MasterGuard)
  @HttpCode(204)
  removerRegraGlobal(@Param('id', ParseUUIDPipe) id: string) {
    return this.repo.removerRegra(null, id);
  }

  private criarRegraEm(escopo: EscopoRegra, autorId: string, corpo: unknown) {
    const entrada = lerEntradaRegra(corpo, false);
    if (!entrada) throw invalido('Nome (até 80) e texto (até 500) são obrigatórios.');
    return this.repo.criarRegra(escopo, autorId, entrada);
  }

  private editarRegraEm(escopo: EscopoRegra, autorId: string, id: string, corpo: unknown) {
    const entrada = lerEntradaRegra(corpo, true);
    if (!entrada) throw invalido();
    return this.repo.editarRegra(escopo, autorId, id, entrada);
  }

  // ── Memórias ───────────────────────────────────────────────────────────────

  @Get('memorias')
  async memorias(@CurrentAuth() { user }: AuthContext) {
    return { memorias: await this.repo.listarMemorias(user.id) };
  }

  @Post('memorias')
  criarMemoria(@CurrentAuth() { user }: AuthContext, @Body() corpo: unknown) {
    const entrada = lerEntradaMemoria(corpo, false);
    if (!entrada?.texto) throw invalido('Texto obrigatório (até 300 caracteres).');
    return this.repo.criarMemoria(user.id, entrada.texto);
  }

  @Patch('memorias/:id')
  editarMemoria(@CurrentAuth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() corpo: unknown) {
    const entrada = lerEntradaMemoria(corpo, true);
    if (!entrada) throw invalido();
    return this.repo.editarMemoria(user.id, id, entrada);
  }

  @Delete('memorias/:id')
  @HttpCode(204)
  removerMemoria(@CurrentAuth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.removerMemoria(user.id, id);
  }

  // ── Perguntas rápidas ──────────────────────────────────────────────────────

  @Get('perguntas')
  async perguntas(@CurrentAuth() { user }: AuthContext) {
    return { perguntas: await this.repo.listarPerguntas(user.id) };
  }

  @Post('perguntas')
  criarPergunta(@CurrentAuth() { user }: AuthContext, @Body() corpo: unknown) {
    const entrada = lerEntradaPergunta(corpo, false);
    if (!entrada?.texto) throw invalido('Texto obrigatório (até 200 caracteres).');
    return this.repo.criarPergunta(user.id, entrada.texto);
  }

  @Patch('perguntas/:id')
  editarPergunta(
    @CurrentAuth() { user }: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: unknown,
  ) {
    const entrada = lerEntradaPergunta(corpo, true);
    if (!entrada) throw invalido();
    return this.repo.editarPergunta(user.id, id, entrada);
  }

  @Delete('perguntas/:id')
  @HttpCode(204)
  removerPergunta(@CurrentAuth() { user }: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.repo.removerPergunta(user.id, id);
  }

  // ── Só Master ──────────────────────────────────────────────────────────────

  /** Auditoria das chamadas de ferramenta (últimos 90 dias). */
  @Get('auditoria')
  @UseGuards(MasterGuard)
  @Header('Cache-Control', 'no-store')
  async auditoria(@Query('limite') limite?: string) {
    const n = Number(limite);
    return { registros: await this.repo.listarAuditoria(Number.isFinite(n) ? n : 100) };
  }

  /** O Master libera (ou tira) o assistente de uma pessoa. */
  @Get('usuarios/:id/permissao')
  @UseGuards(MasterGuard)
  async permissao(@Param('id', ParseUUIDPipe) id: string) {
    return { autorizado: await this.repo.lerPermissao(id) };
  }

  @Put('usuarios/:id/permissao')
  @UseGuards(MasterGuard)
  async gravarPermissao(
    @CurrentAuth() { user }: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() corpo: { autorizado?: unknown },
  ) {
    if (typeof corpo?.autorizado !== 'boolean') throw invalido();
    await this.repo.gravarPermissao(id, corpo.autorizado, user.id);
    return { autorizado: corpo.autorizado };
  }
}
