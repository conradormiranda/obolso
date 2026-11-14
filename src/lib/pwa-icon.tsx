import { ImageResponse } from "next/og";

/** Ícone do app gerado no build: o bolso (versão 1A) dourado sobre fundo escuro. */
export function renderAppIcon(size: number, opts: { maskable?: boolean } = {}) {
  const pad = opts.maskable ? size * 0.22 : size * 0.14;
  const mark = size - pad * 2;
  const gold = "#D4AF6A";
  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#222222",
          borderRadius: opts.maskable ? 0 : size * 0.22,
        }}
      >
        <svg width={mark} height={mark} viewBox="0 0 32 32" fill="none" stroke={gold} strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 6.5h18v12.2c0 .9-.4 1.7-1.2 2.2L16 26l-7.8-5.1c-.8-.5-1.2-1.3-1.2-2.2z" strokeWidth="1.3" />
          <path
            d="M9.6 9.2h12.8v9c0 .5-.2.9-.6 1.2L16 23.1l-5.8-3.7c-.4-.3-.6-.7-.6-1.2z"
            strokeWidth="0.85"
            strokeDasharray="1.4 1.7"
            opacity="0.75"
          />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
