// Visual comum dos modais (o mesmo do HelpDialog). Cada modal só acrescenta a largura e o espaçamento.

export const DIALOG_BACKDROP =
  "fixed inset-0 z-50 bg-black/60 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0";

export const DIALOG_POPUP =
  "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-2xl bg-popover text-popover-foreground ring-1 ring-foreground/10 duration-150 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95";

/** Botões no tamanho dos formulários do hub (h-11). */
export const PRIMARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-bold text-primary-foreground transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50";

export const SECONDARY_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-input px-5 text-sm font-semibold text-foreground transition-colors hover:border-line-hover hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

export const DANGER_BUTTON =
  "inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-destructive px-5 text-sm font-bold text-white transition hover:brightness-110 disabled:pointer-events-none disabled:opacity-50";

export const ICON_BUTTON =
  "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-ink-nav transition-colors hover:bg-hover-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40";
