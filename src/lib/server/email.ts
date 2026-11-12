import "server-only";
import { serverEnv } from "@/lib/env";
import { logSecurityEvent } from "./log";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const env = serverEnv();
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_FROM) {
    logSecurityEvent("email_skipped_not_configured");
    return;
  }
  const html = `<div style="font-family:sans-serif;font-size:15px;line-height:1.5">${escapeHtml(text).replace(/\n/g, "<br>")}</div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.ALERT_EMAIL_FROM, to: [to], subject, text, html }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) logSecurityEvent("email_send_failed", { status: res.status });
}

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "full",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

export async function sendLoginAlert(to: string, info: { userAgent: string; ip: string; at: Date }): Promise<void> {
  const origin = serverEnv().APP_ORIGIN;
  await sendEmail(
    to,
    "Novo acesso ao O Bolso",
    [
      "Detectamos um login na sua conta do O Bolso a partir de um dispositivo ou navegador novo.",
      "",
      `Quando: ${dateFmt.format(info.at)}`,
      `Navegador: ${info.userAgent}`,
      `IP: ${info.ip}`,
      "",
      "Se foi você, pode ignorar este e-mail.",
      `Se não foi, troque sua senha e use "Sair de todos os dispositivos" em ${origin}.`,
    ].join("\n"),
  );
}

export async function sendRecoveryCodeUsedAlert(to: string): Promise<void> {
  await sendEmail(
    to,
    "Código de recuperação usado no O Bolso",
    [
      "Um código de recuperação de MFA foi usado na sua conta do O Bolso agora.",
      "O autenticador anterior foi removido e um novo precisa ser configurado.",
      "",
      "Se não foi você, troque sua senha imediatamente e avise o outro membro da família.",
    ].join("\n"),
  );
}
