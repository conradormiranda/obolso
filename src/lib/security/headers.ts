/**
 * Content-Security-Policy estrita com nonce por requisição.
 * - script-src: só scripts com nonce ('strict-dynamic' propaga para os que
 *   eles carregam, como o widget do Turnstile). Sem 'unsafe-inline'/'unsafe-eval'
 *   (o 'unsafe-eval' só existe em desenvolvimento, exigido pelo React Refresh).
 * - O navegador nunca fala com o Supabase: connect-src 'self'.
 */
export function buildCsp(nonce: string, isDev: boolean, httpsOrigin = !isDev): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      "https://challenges.cloudflare.com",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'"],
    "connect-src": ["'self'", ...(isDev ? ["ws:"] : [])],
    "frame-src": ["https://challenges.cloudflare.com"],
    "frame-ancestors": ["'none'"],
    "form-action": ["'self'"],
    "base-uri": ["'none'"],
    "object-src": ["'none'"],
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v.join(" ")}`);
  if (httpsOrigin) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Cabeçalhos estáticos aplicados a todas as respostas (next.config). */
export const staticSecurityHeaders: { key: string; value: string }[] = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: [
      "camera=()",
      "microphone=()",
      "geolocation=()",
      "payment=()",
      "usb=()",
      "bluetooth=()",
      "serial=()",
      "hid=()",
      "magnetometer=()",
      "gyroscope=()",
      "accelerometer=()",
      "display-capture=()",
      "browsing-topics=()",
      "interest-cohort=()",
    ].join(", "),
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];
