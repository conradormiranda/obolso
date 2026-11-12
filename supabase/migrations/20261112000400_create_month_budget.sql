-- Fase 2: cria o orçamento de um mês com as metas padrão, numa única transação.
-- SECURITY INVOKER: roda com as permissões e o RLS de quem chama (membro aal2).
-- Idempotente: se o mês já existe, devolve o id existente.
--
-- Metas padrão: Custos fixos 40%, Conforto 10%, Metas 10%, Prazeres 10%,
-- Liberdade financeira 25%, Conhecimento 5%.
create function public.create_month_budget(p_month date)
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_budget    uuid;
begin
  if not app_private.is_member_aal2(v_household) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1
     or p_month < date '2000-01-01' or p_month > date '2100-12-01' then
    raise exception 'mês inválido' using errcode = '22023';
  end if;

  select b.id into v_budget from public.monthly_budgets b
   where b.household_id = v_household and b.month = p_month;
  if v_budget is not null then
    return v_budget;
  end if;

  insert into public.monthly_budgets (household_id, month)
  values (v_household, p_month)
  returning id into v_budget;

  insert into public.category_targets (household_id, budget_id, category_id, percent_bp)
  select v_household, v_budget, c.id,
         case c.key
           when 'custos_fixos' then 4000
           when 'conforto' then 1000
           when 'metas' then 1000
           when 'prazeres' then 1000
           when 'liberdade_financeira' then 2500
           when 'conhecimento' then 500
         end
    from public.categories c
   where c.household_id = v_household;

  return v_budget;
end
$$;
revoke all on function public.create_month_budget(date) from public, anon;
grant execute on function public.create_month_budget(date) to authenticated;
