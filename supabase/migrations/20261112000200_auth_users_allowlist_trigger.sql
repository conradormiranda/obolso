-- Trava de cadastro no próprio banco: nenhum usuário pode ser criado em
-- auth.users (por signup, convite, OAuth ou API admin), nem ter o e-mail
-- trocado, se o e-mail não estiver em app_private.allowed_emails.
-- Complementa o hook before_user_created, que não cobre a API admin.
create function app_private.enforce_allowed_email()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null
     or not exists (
       select 1 from app_private.allowed_emails a where a.email = lower(btrim(new.email))
     ) then
    raise exception 'Cadastro desativado' using errcode = '42501';
  end if;
  return new;
end
$$;
revoke all on function app_private.enforce_allowed_email() from public, anon, authenticated;

create trigger obolso_enforce_allowed_email
  before insert or update of email on auth.users
  for each row execute function app_private.enforce_allowed_email();
