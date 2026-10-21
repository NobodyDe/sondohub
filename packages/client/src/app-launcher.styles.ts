export const launcherCss = `
.sondo-launcher { position: relative; display: inline-block; font-family: system-ui, sans-serif; }
.sondo-launcher__button { display: grid; place-items: center; width: 40px; height: 40px; border: 0; border-radius: 8px; background: transparent; color: #334155; cursor: pointer; }
.sondo-launcher__button:hover, .sondo-launcher__button[aria-expanded="true"] { background: #e2e8f0; }
.sondo-launcher__button svg { fill: currentColor; }
.sondo-launcher__panel { position: absolute; top: 48px; left: 0; z-index: 1000; width: 320px; padding: 16px; border-radius: 12px; background: #fff; box-shadow: 0 10px 30px rgb(15 23 42 / 0.2); }
.sondo-launcher__grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0; padding: 0; list-style: none; }
.sondo-launcher__app { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: 8px; color: #0f172a; font-size: 12px; text-align: center; text-decoration: none; }
.sondo-launcher__app:hover { background: #f1f5f9; }
.sondo-launcher__hint { margin: 0; color: #64748b; font-size: 13px; }
.sondo-launcher__hub { display: block; margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; color: #2563eb; font-size: 13px; text-align: center; text-decoration: none; }
`;
