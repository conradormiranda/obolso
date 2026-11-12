/** Resumo legível de um User-Agent ("Safari no iPhone"). Só para exibição. */
export function describeUserAgent(ua: string): string {
  if (!ua) return "Dispositivo desconhecido";
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : "outro sistema";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\/|FxiOS/.test(ua)
      ? "Firefox"
      : /CriOS|Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : /node|undici|supabase/i.test(ua)
            ? "Servidor"
            : "Navegador";
  return `${browser} no ${os}`;
}
