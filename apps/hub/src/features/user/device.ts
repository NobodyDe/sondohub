// device.ts
// A ordem importa: o user agent do Edge também diz "Chrome", e o do Chrome também diz "Safari".
const BROWSERS = [
  { pattern: /Edg\//, name: "Edge" },
  { pattern: /OPR\//, name: "Opera" },
  { pattern: /Chrome\//, name: "Chrome" },
  { pattern: /Firefox\//, name: "Firefox" },
  { pattern: /Safari\//, name: "Safari" },
];

// Aqui também: o Android diz "Linux", e o iPhone diz "like Mac OS X".
const SYSTEMS = [
  { pattern: /Windows/, name: "Windows", isMobile: false },
  { pattern: /Android/, name: "Android", isMobile: true },
  { pattern: /iPhone|iPad/, name: "iOS", isMobile: true },
  { pattern: /Mac OS/, name: "macOS", isMobile: false },
  { pattern: /Linux/, name: "Linux", isMobile: false },
];

const UNKNOWN_SYSTEM = { name: "sistema desconhecido", isMobile: false };

/** "Mozilla/5.0 (Windows NT 10.0…) Chrome/130…" → { browser: "Chrome", system: "Windows", isMobile: false } */
export function describeDevice(userAgent: string | null) {
  const ua = userAgent ?? "";
  const browser =
    BROWSERS.find(({ pattern }) => pattern.test(ua))?.name ?? "Navegador";
  const system =
    SYSTEMS.find(({ pattern }) => pattern.test(ua)) ?? UNKNOWN_SYSTEM;
  return { browser, system: system.name, isMobile: system.isMobile };
}
