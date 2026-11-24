/** Como o microfone do assistente trabalha: sempre aberto, ou só enquanto o botão está apertado. Salvo no banco, por usuário. */
export type ModoMic = 'aberto' | 'apertar'

/** Em "apertar", o áudio só sobe enquanto o botão estiver apertado. */
export function micLiberado(modo: ModoMic, segurando: boolean): boolean {
  return modo === 'aberto' || segurando
}
