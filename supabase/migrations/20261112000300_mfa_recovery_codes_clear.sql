-- Ao cadastrar um novo autenticador, os códigos de recuperação anteriores são
-- invalidados; o usuário é obrigado a gerar um conjunto novo.
create function public.mfa_recovery_codes_clear()
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not app_private.is_member_aal2(app_private.my_household_id()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from app_private.mfa_recovery_codes where user_id = auth.uid();
end
$$;
revoke all on function public.mfa_recovery_codes_clear() from public, anon;
grant execute on function public.mfa_recovery_codes_clear() to authenticated;
