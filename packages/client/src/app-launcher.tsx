import type { LauncherApp } from "@sondohub/contracts";
import { useEffect, useRef, useState } from "react";
import { launcherCss } from "./app-launcher.styles.js";
import { useSondoContext } from "./react.js";

export function AppLauncher() {
  const { auth } = useSondoContext();
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<LauncherApp[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc, mas só escuta o documento enquanto está aberto.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    setOpen((isOpen) => !isOpen);
    if (!apps) auth.getApps().then(setApps, () => setApps([])); // busca só na 1ª abertura
  }

  return (
    <div ref={rootRef} className="sondo-launcher">
      {/* O React 19 sobe este <style> para o <head> e não duplica, mesmo com vários launchers. */}
      <style href="sondo-launcher" precedence="default">
        {launcherCss}
      </style>
      <button
        type="button"
        className="sondo-launcher__button"
        aria-label="Aplicativos"
        aria-expanded={open}
        onClick={toggle}
      >
        <GridIcon />
      </button>
      {open && (
        <div className="sondo-launcher__panel">
          {apps === null ? (
            <p className="sondo-launcher__hint">Carregando…</p>
          ) : (
            <ul className="sondo-launcher__grid">
              {apps.map((app) => (
                <li key={app.slug}>
                  <a className="sondo-launcher__app" href={app.url}>
                    <img src={app.iconUrl} alt="" width={40} height={40} />
                    <span>{app.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a className="sondo-launcher__hub" href={auth.hubUrl}>
            Ir para a central
          </a>
        </div>
      )}
    </div>
  );
}

function GridIcon() {
  const positions = [2, 8, 14];
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      {positions.flatMap((y) =>
        positions.map((x) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="4" height="4" rx="1" />
        )),
      )}
    </svg>
  );
}
