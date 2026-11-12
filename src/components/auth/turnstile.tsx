"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      action: string;
      theme: "dark";
      language: string;
      "response-field-name": string;
    },
  ) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Widget do Cloudflare Turnstile (render explícito). O script é carregado com o
 * nonce da CSP. O token vai no campo oculto "cf-turnstile-response" do form e
 * é validado no servidor. `resetSignal` muda a cada tentativa (token é de uso único).
 */
export function Turnstile({
  siteKey,
  nonce,
  action,
  resetSignal,
}: {
  siteKey: string;
  nonce: string;
  action: string;
  resetSignal: unknown;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.turnstile) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !container.current || widgetId.current || !window.turnstile) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      action,
      theme: "dark",
      language: "pt-br",
      "response-field-name": "cf-turnstile-response",
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [ready, siteKey, action]);

  useEffect(() => {
    if (widgetId.current) window.turnstile?.reset(widgetId.current);
  }, [resetSignal]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        nonce={nonce}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      <div ref={container} className="min-h-[65px]" aria-label="Verificação anti-robô" />
    </>
  );
}
