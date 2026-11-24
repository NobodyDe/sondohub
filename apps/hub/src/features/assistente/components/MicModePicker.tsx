import type { AssistenteModoMic } from "@sondohub/contracts";
import Segmented from "./Segmented.tsx";

const OPTIONS: { value: AssistenteModoMic; label: string }[] = [
  { value: "aberto", label: "Microfone aberto" },
  { value: "apertar", label: "Apertar para falar" },
];

/** Microfone sempre aberto ou só enquanto o botão da bolinha está apertado. */
export default function MicModePicker({
  value,
  onChange,
}: {
  value: AssistenteModoMic;
  onChange: (value: AssistenteModoMic) => void;
}) {
  return <Segmented label="Modo do microfone" value={value} options={OPTIONS} onChange={onChange} />;
}
