import "server-only";

/**
 * Log de eventos de segurança. Nunca registra e-mail, senha, token, IP em
 * claro nem qualquer dado financeiro — só o nome do evento e metadados neutros.
 */
type SafeMeta = Record<string, string | number | boolean>;

export function logSecurityEvent(event: string, meta: SafeMeta = {}): void {
  console.info(JSON.stringify({ type: "security", event, ...meta, at: new Date().toISOString() }));
}
