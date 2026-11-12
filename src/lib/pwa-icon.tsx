import { ImageResponse } from "next/og";

/** Ícone do app gerado no build: moeda dourada com "B" sobre fundo escuro. */
export function renderAppIcon(size: number, opts: { maskable?: boolean } = {}) {
  const inset = opts.maskable ? size * 0.2 : size * 0.1;
  const coin = size - inset * 2;
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
        <div
          style={{
            width: coin,
            height: coin,
            borderRadius: coin,
            background: "#D4AF6A",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#1A1A1A",
            fontSize: coin * 0.62,
            fontWeight: 800,
            lineHeight: 1,
          }}
        >
          B
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
