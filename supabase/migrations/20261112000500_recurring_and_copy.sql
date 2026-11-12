-- Fase 3
-- 1) Ao criar um mês novo, os modelos recorrentes ativos daquele mês viram
--    lançamentos (editáveis no mês sem alterar o modelo).
-- 2) "Copiar metas e rendas do mês anterior".
-- Ambas SECURITY INVOKER: RLS e permissões de quem chama (membro aal2).

create or replace function public.create_month_budget(p_month date)
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_budget    uuid;
  v_last_day  date;
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

  -- Recorrentes ativos vigentes no mês. Dia = dia de início do modelo,
  -- limitado ao último dia do mês (ex.: dia 31 em fevereiro → 28/29).
  v_last_day := (p_month + interval '1 month' - interval '1 day')::date;
  insert into public.expenses (household_id, budget_id, category_id, description, amount_cents,
                               expense_date, paid_by, payment_method, is_recurring, recurring_template_id)
  select v_household, v_budget, t.category_id, t.description, t.amount_cents,
         least(p_month + (extract(day from t.starts_on)::integer - 1), v_last_day),
         t.paid_by, t.payment_method, true, t.id
    from public.recurring_templates t
   where t.household_id = v_household
     and t.active
     and t.starts_on <= v_last_day
     and (t.ends_on is null or t.ends_on >= p_month);

  return v_budget;
end
$$;

-- Copia as metas do mês anterior (sobrescreve) e as rendas cuja descrição
-- ainda não exista no mês atual (não duplica se clicado de novo).
-- Retorna quantas rendas foram copiadas.
create function public.copy_previous_month(p_month date)
returns integer language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_current   uuid;
  v_previous  uuid;
  v_count     integer;
begin
  if not app_private.is_member_aal2(v_household) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select b.id into v_previous from public.monthly_budgets b
   where b.household_id = v_household and b.month = (p_month - interval '1 month')::date;
  if v_previous is null then
    raise exception 'O mês anterior não tem orçamento' using errcode = 'P0002';
  end if;

  v_current := public.create_month_budget(p_month);

  insert into public.category_targets (household_id, budget_id, category_id, percent_bp)
  select v_household, v_current, t.category_id, t.percent_bp
    from public.category_targets t
   where t.budget_id = v_previous
  on conflict (budget_id, category_id) do update set percent_bp = excluded.percent_bp;

  insert into public.incomes (household_id, budget_id, description, amount_cents, received_by)
  select v_household, v_current, i.description, i.amount_cents, i.received_by
    from public.incomes i
   where i.budget_id = v_previous
     and not exists (
       select 1 from public.incomes c
        where c.budget_id = v_current and lower(c.description) = lower(i.description)
     );
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
revoke all on function public.copy_previous_month(date) from public, anon;
grant execute on function public.copy_previous_month(date) to authenticated;
