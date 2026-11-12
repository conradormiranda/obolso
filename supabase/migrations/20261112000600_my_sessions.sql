-- Fase 4: "ver sessões ativas" nas configurações.
-- Só devolve as sessões do PRÓPRIO usuário, e só com aal2 + membro.
create function public.my_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  aal text,
  is_current boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not app_private.is_member_aal2(app_private.my_household_id()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select s.id,
           s.created_at,
           coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at),
           left(coalesce(s.user_agent, ''), 300),
           coalesce(host(s.ip), ''),
           coalesce(s.aal::text, ''),
           s.id::text = coalesce(auth.jwt() ->> 'session_id', '')
      from auth.sessions s
     where s.user_id = auth.uid()
       and (s.not_after is null or s.not_after > now())
     order by coalesce(s.refreshed_at::timestamptz, s.updated_at, s.created_at) desc;
end
$$;
revoke all on function public.my_sessions() from public, anon;
grant execute on function public.my_sessions() to authenticated;
