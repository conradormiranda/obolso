import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_MS,
  INACTIVITY_MS,
  decodeSessionMeta,
  encodePwReset,
  encodeSessionMeta,
  evaluateSession,
  isPwResetValid,
} from "@/lib/security/session-policy";

const SECRET = "s".repeat(40);
const USER = "6f1c2b9e-4a1d-4c5e-9f7a-1b2c3d4e5f60";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

describe("expiração de sessão", () => {
  const start = 1_800_000_000_000;

  it("sessão ativa dentro dos limites", () => {
    const r = evaluateSession({ u: USER, s: start, l: start }, USER, start + 10_000);
    expect(r.ok).toBe(true);
  });

  it("expira após 30 min de inatividade", () => {
    const r = evaluateSession({ u: USER, s: start, l: start }, USER, start + INACTIVITY_MS + 1);
    expect(r).toEqual({ ok: false, reason: "inactive" });
  });

  it("expira após 7 dias mesmo com atividade", () => {
    const now = start + ABSOLUTE_MS + 1;
    const r = evaluateSession({ u: USER, s: start, l: now - 1000 }, USER, now);
    expect(r).toEqual({ ok: false, reason: "absolute" });
  });

  it("falha fechado sem cookie ou com usuário diferente", () => {
    expect(evaluateSession(null, USER, start)).toEqual({ ok: false, reason: "missing" });
    expect(evaluateSession({ u: OTHER, s: start, l: start }, USER, start)).toEqual({ ok: false, reason: "user-mismatch" });
  });
});

describe("cookie assinado", () => {
  it("ida e volta", async () => {
    const token = await encodeSessionMeta(SECRET, { u: USER, s: 1, l: 2 });
    expect(await decodeSessionMeta(SECRET, token)).toEqual({ u: USER, s: 1, l: 2 });
  });

  it("rejeita adulteração, segredo errado e lixo", async () => {
    const token = await encodeSessionMeta(SECRET, { u: USER, s: 1, l: 2 });
    const [body, sig] = token.split(".") as [string, string];
    const forged = Buffer.from(JSON.stringify({ u: USER, s: 1, l: 9_999_999_999_999 })).toString("base64url");
    expect(await decodeSessionMeta(SECRET, `${forged}.${sig}`)).toBeNull();
    expect(await decodeSessionMeta("x".repeat(40), token)).toBeNull();
    expect(await decodeSessionMeta(SECRET, `${body}`)).toBeNull();
    expect(await decodeSessionMeta(SECRET, "a.b.c")).toBeNull();
    expect(await decodeSessionMeta(SECRET, undefined)).toBeNull();
  });

  it("token de outra finalidade não é aceito", async () => {
    const pw = await encodePwReset(SECRET, USER, 1);
    expect(await decodeSessionMeta(SECRET, pw)).toBeNull();
  });

  it("redefinição de senha: vínculo com usuário e validade de 15 min", async () => {
    const now = 1_800_000_000_000;
    const t = await encodePwReset(SECRET, USER, now);
    expect(await isPwResetValid(SECRET, t, USER, now + 60_000)).toBe(true);
    expect(await isPwResetValid(SECRET, t, OTHER, now + 60_000)).toBe(false);
    expect(await isPwResetValid(SECRET, t, USER, now + 16 * 60_000)).toBe(false);
  });
});
