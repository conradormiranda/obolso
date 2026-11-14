import type { MetadataRoute } from "next";

/**
 * PWA instalável (ícone na tela inicial). Sem service worker de propósito:
 * nada de cache offline de dados financeiros. Todas as páginas exigem rede.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "O Bolso",
    short_name: "O Bolso",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#222222",
    theme_color: "#222222",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
