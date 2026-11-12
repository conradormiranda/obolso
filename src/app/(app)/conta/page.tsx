import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/app/panel";
import { ChangePasswordForm, DisplayNameForm, ReplaceAuthenticatorForm } from "@/components/app/settings-forms";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { describeUserAgent } from "@/lib/domain/user-agent";
import { requireMember } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Configurações" };

const dateFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export default async function AccountPage() {
  const { supabase, user } = await requireMember();
  const [{ data: me }, { data: factors }, { data: remaining }, { data: sessions }] = await Promise.all([
    supabase.from("household_members").select("display_name").eq("user_id", user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
    supabase.rpc("mfa_recovery_codes_remaining"),
    supabase.rpc("my_sessions"),
  ]);
  const totp = factors?.all.find((f) => f.factor_type === "totp" && f.status === "verified");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Configurações</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      <Panel title="Perfil">
        <DisplayNameForm current={me?.display_name ?? ""} />
      </Panel>

      <Panel title="Senha">
        <ChangePasswordForm />
      </Panel>

      <Panel title="Verificação em duas etapas">
        <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Autenticador</dt>
            <dd className="font-semibold">
              {totp ? `Ativo desde ${dateFmt.format(new Date(totp.created_at))}` : "Não configurado"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Códigos de recuperação</dt>
            <dd className="font-semibold">
              {remaining ?? 0} restante{(remaining ?? 0) === 1 ? "" : "s"} ·{" "}
              <Link href="/mfa/codigos" className="text-primary underline-offset-4 hover:underline">
                gerar novos
              </Link>
            </dd>
          </div>
        </dl>
        <ReplaceAuthenticatorForm />
      </Panel>

      <Panel title="Sessões ativas">
        <ul className="divide-y divide-dashed divide-border text-sm">
          {(sessions ?? []).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <span>
                <span className="font-semibold">{describeUserAgent(s.user_agent)}</span>
                {s.is_current ? <span className="ml-2 rounded bg-primary/20 px-1.5 text-xs text-primary">esta sessão</span> : null}
                <span className="block text-xs text-muted-foreground">
                  {s.ip || "IP desconhecido"} · desde {dateFmt.format(new Date(s.created_at))}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                ativa em {dateFmt.format(new Date(s.last_active_at))}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <SignOutButton everywhere />
        </div>
      </Panel>

      <Panel title="Histórico">
        <Link href="/auditoria" className="text-primary underline-offset-4 hover:underline">
          Ver log de auditoria (somente leitura)
        </Link>
      </Panel>

      <SignOutButton />
    </div>
  );
}
