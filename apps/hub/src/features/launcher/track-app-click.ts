/**
 * Avisa a API que um app foi aberto pelo hub (alimenta o painel do Master).
 * sendBeacon não segura a navegação e chega mesmo com a página indo embora.
 */
export function trackAppClick(slug: string): void {
  const body = new Blob([JSON.stringify({ slug })], { type: "application/json" });
  navigator.sendBeacon("/api/events/app-click", body);
}
