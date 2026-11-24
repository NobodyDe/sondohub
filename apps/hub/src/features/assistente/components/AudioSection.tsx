import { RefreshCw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  escolherDispositivo,
  lerPrefAudio,
  listarDispositivosAudio,
  salvarPrefAudio,
  saidaSelecionavel,
  type DispositivoAudio,
  type DispositivosAudio,
} from "../lib/audio-devices.ts";

const SELECT =
  "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm";
const BUTTON =
  "flex h-11 items-center gap-1.5 rounded-[10px] border border-input px-4 text-sm font-semibold transition-colors hover:bg-secondary disabled:opacity-50";

// Aparelho salvo que não está mais conectado continua na lista, marcado.
function withSaved(devices: DispositivoAudio[], saved?: DispositivoAudio) {
  const real = devices.filter((device) => device.id !== "default");
  return saved && !escolherDispositivo(devices, saved) ? [...real, { ...saved, rotulo: `${saved.rotulo} (não conectado)` }] : real;
}

/** Microfone e saída da conversa por voz. Vale só neste aparelho e na próxima conversa. */
export default function AudioSection() {
  const [list, setList] = useState<DispositivosAudio>({ entradas: [], saidas: [], semNomes: false });
  const [pref, setPref] = useState(lerPrefAudio);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const canPickOutput = saidaSelecionavel();

  const refresh = useCallback(async (askPermission: boolean) => {
    setLoading(true);
    try {
      if (askPermission) {
        // Sem permissão o navegador esconde os nomes dos aparelhos.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      }
      setList(await listarDispositivosAudio());
    } catch (error) {
      const denied = error instanceof DOMException && error.name === "NotAllowedError";
      setMessage(denied ? "Permita o uso do microfone para ver os nomes dos dispositivos." : "Não foi possível listar os dispositivos.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const onChange = () => void refresh(false);
    onChange();
    navigator.mediaDevices.addEventListener?.("devicechange", onChange);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", onChange);
  }, [refresh]);

  function choose(kind: "entrada" | "saida", id: string, devices: DispositivoAudio[]) {
    const next = { ...pref, [kind]: id ? devices.find((device) => device.id === id) : undefined };
    setPref(next);
    salvarPrefAudio(next);
    setMessage("Salvo. Vale na próxima conversa.");
  }

  async function testOutput() {
    const ctx = new AudioContext();
    try {
      const id = escolherDispositivo(list.saidas, pref.saida);
      if (id && canPickOutput) await (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(id);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.15;
      oscillator.frequency.value = 660;
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.6);
      await new Promise((resolve) => setTimeout(resolve, 750));
    } catch {
      setMessage("Não foi possível tocar nesse dispositivo.");
    } finally {
      void ctx.close();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Microfone
        <select
          className={SELECT}
          value={escolherDispositivo(list.entradas, pref.entrada) ?? ""}
          onChange={(event) => choose("entrada", event.target.value, list.entradas)}
        >
          <option value="">Padrão do sistema</option>
          {withSaved(list.entradas, pref.entrada).map((device) => (
            <option key={device.id} value={device.id}>
              {device.rotulo}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-semibold">
        Saída de áudio
        <select
          className={SELECT}
          disabled={!canPickOutput}
          value={escolherDispositivo(list.saidas, pref.saida) ?? ""}
          onChange={(event) => choose("saida", event.target.value, list.saidas)}
        >
          <option value="">Padrão do sistema</option>
          {withSaved(list.saidas, pref.saida).map((device) => (
            <option key={device.id} value={device.id}>
              {device.rotulo}
            </option>
          ))}
        </select>
        {!canPickOutput && (
          <span className="text-[13px] font-normal text-muted-foreground">
            Este navegador não deixa escolher a saída: o assistente usa a do sistema.
          </span>
        )}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={BUTTON} disabled={loading} onClick={() => void refresh(true)}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          {list.semNomes ? "Permitir e listar" : "Atualizar lista"}
        </button>
        <button type="button" className={BUTTON} onClick={() => void testOutput()}>
          <Volume2 className="size-4" aria-hidden /> Testar saída
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
    </div>
  );
}
