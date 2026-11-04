import { useEffect, useRef } from "react";

type Pending = { timer: number; run: () => void };

/**
 * Debounce por chave: cada chave guarda só a última chamada, que roda `delay` ms depois do último clique.
 * Chaves diferentes não se atrapalham: mudar o cargo não cancela a mudança de um app.
 */
export function useDebounceByKey(delay: number) {
  const pending = useRef(new Map<string, Pending>());

  // Ao sair da tela, o que estava esperando roda na hora: a tela já mostrou a mudança, ela não pode se perder.
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      for (const { timer, run } of waiting.values()) {
        clearTimeout(timer);
        run();
      }
      waiting.clear();
    };
  }, []);

  function schedule(key: string, run: () => void) {
    clearTimeout(pending.current.get(key)?.timer);
    const timer = window.setTimeout(() => {
      pending.current.delete(key);
      run();
    }, delay);
    pending.current.set(key, { timer, run });
  }

  return { schedule, hasPending: () => pending.current.size > 0 };
}
