-- =====================================================================
-- Espaço PESSOAL por usuário.
--   owner_id IS NULL  → orçamento da família (os dois membros veem)
--   owner_id = user   → orçamento pessoal (SÓ o dono vê, cria e altera)
-- A regra vale no banco (RLS), não só na interface.
-- =====================================================================

-- 1) Colunas de dono -----------------------------------------------------
alter table public.monthly_budgets     add column owner_id uuid null references auth.users (id) on delete cascade;
alter table public.recurring_templates add column owner_id uuid null references auth.users (id) on delete cascade;
alter table public.expenses            add column owner_id uuid null;
alter table public.incomes             add column owner_id uuid null;
alter table public.category_targets    add column owner_id uuid null;
alter table public.audit_log           add column owner_id uuid null;

create index monthly_budgets_owner_idx on public.monthly_budgets (owner_id);
create index expenses_owner_idx on public.expenses (owner_id);
create index audit_log_owner_idx on public.audit_log (owner_id);

-- Um orçamento por mês POR ESPAÇO (família ou pessoal de cada um).
alter table public.monthly_budgets drop constraint monthly_budgets_household_id_month_key;
create unique index monthly_budgets_space_month_key
  on public.monthly_budgets (household_id, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

-- 2) Autorização por espaço ---------------------------------------------
create function app_private.can_access(p_household uuid, p_owner uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select app_private.is_member_aal2(p_household)
     and (p_owner is null or p_owner = auth.uid())
$$;
revoke all on function app_private.can_access(uuid, uuid) from public;
grant execute on function app_private.can_access(uuid, uuid) to authenticated, service_role;

-- 3) Filhos herdam o dono do orçamento (não dá para "pendurar" um lançamento
--    no orçamento pessoal de outra pessoa: o dono herdado reprova o RLS).
create function app_private.inherit_budget_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select b.owner_id into new.owner_id from public.monthly_budgets b where b.id = new.budget_id;
  return new;
end
$$;
create trigger expenses_inherit_owner before insert or update on public.expenses
  for each row execute function app_private.inherit_budget_owner();
create trigger incomes_inherit_owner before insert or update on public.incomes
  for each row execute function app_private.inherit_budget_owner();
create trigger category_targets_inherit_owner before insert or update on public.category_targets
  for each row execute function app_private.inherit_budget_owner();

-- Recorrente gerado num mês precisa ser do mesmo espaço do orçamento.
create function app_private.expense_template_same_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.recurring_template_id is not null and exists (
       select 1 from public.recurring_templates t
        where t.id = new.recurring_template_id
          and t.owner_id is distinct from new.owner_id) then
    raise exception 'Recorrente de outro espaço' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger expenses_zz_template_owner before insert or update on public.expenses
  for each row execute function app_private.expense_template_same_owner();

-- Dono é imutável depois de criado.
create or replace function app_private.set_row_meta()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := now();
    if tg_table_name in ('monthly_budgets', 'recurring_templates') then
      new.owner_id := old.owner_id;
    end if;
  end if;
  return new;
end
$$;

-- 4) Políticas RLS por espaço --------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['monthly_budgets', 'category_targets', 'incomes', 'recurring_templates', 'expenses']
  loop
    execute format('drop policy %I on public.%I', t || '_select', t);
    execute format('drop policy %I on public.%I', t || '_insert', t);
    execute format('drop policy %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for select to authenticated using (app_private.can_access(household_id, owner_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.can_access(household_id, owner_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.can_access(household_id, owner_id)) with check (app_private.can_access(household_id, owner_id))', t || '_update', t);
  end loop;
  foreach t in array array['incomes', 'recurring_templates']
  loop
    execute format('drop policy %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.can_access(household_id, owner_id))', t || '_delete', t);
  end loop;
end
$$;

-- 5) Auditoria: registros do espaço pessoal só para o dono ---------------
create or replace function app_private.audit_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_action text := tg_op;
  v_hh     uuid;
  v_id     text;
  v_owner  uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then v_before := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then v_after := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    if v_before = v_after then return null; end if;
    if v_before ? 'deleted_at' then
      if v_before ->> 'deleted_at' is null and v_after ->> 'deleted_at' is not null then
        v_action := 'SOFT_DELETE';
      elsif v_before ->> 'deleted_at' is not null and v_after ->> 'deleted_at' is null then
        v_action := 'RESTORE';
      end if;
    end if;
  end if;

  v_row := coalesce(v_after, v_before);
  if tg_table_name = 'households' then
    v_hh := (v_row ->> 'id')::uuid;
  else
    v_hh := (v_row ->> 'household_id')::uuid;
  end if;
  v_owner := nullif(v_row ->> 'owner_id', '')::uuid;
  v_id := coalesce(
    v_row ->> 'id',
    case when v_row ? 'budget_id' and v_row ? 'category_id' then (v_row ->> 'budget_id') || ':' || (v_row ->> 'category_id') end,
    v_row ->> 'user_id'
  );

  insert into public.audit_log (household_id, table_name, record_id, action, actor_id, before, after, owner_id)
  values (v_hh, tg_table_name, v_id, v_action, auth.uid(), v_before, v_after, v_owner);
  return null;
end
$$;

drop policy audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using (app_private.can_access(household_id, owner_id));

-- 6) RPCs com o espaço ----------------------------------------------------
drop function public.copy_previous_month(date);
drop function public.create_month_budget(date);

create function public.create_month_budget(p_month date, p_personal boolean default false)
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_owner     uuid := case when p_personal then auth.uid() else null end;
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
   where b.household_id = v_household and b.month = p_month and b.owner_id is not distinct from v_owner;
  if v_budget is not null then
    return v_budget;
  end if;

  insert into public.monthly_budgets (household_id, month, owner_id)
  values (v_household, p_month, v_owner)
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

  v_last_day := (p_month + interval '1 month' - interval '1 day')::date;
  insert into public.expenses (household_id, budget_id, category_id, description, amount_cents,
                               expense_date, paid_by, payment_method, is_recurring, recurring_template_id)
  select v_household, v_budget, t.category_id, t.description, t.amount_cents,
         least(p_month + (extract(day from t.starts_on)::integer - 1), v_last_day),
         t.paid_by, t.payment_method, true, t.id
    from public.recurring_templates t
   where t.household_id = v_household
     and t.owner_id is not distinct from v_owner
     and t.active
     and t.starts_on <= v_last_day
     and (t.ends_on is null or t.ends_on >= p_month);

  return v_budget;
end
$$;
revoke all on function public.create_month_budget(date, boolean) from public, anon;
grant execute on function public.create_month_budget(date, boolean) to authenticated;

create function public.copy_previous_month(p_month date, p_personal boolean default false)
returns integer language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_owner     uuid := case when p_personal then auth.uid() else null end;
  v_current   uuid;
  v_previous  uuid;
  v_count     integer;
begin
  if not app_private.is_member_aal2(v_household) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select b.id into v_previous from public.monthly_budgets b
   where b.household_id = v_household
     and b.month = (p_month - interval '1 month')::date
     and b.owner_id is not distinct from v_owner;
  if v_previous is null then
    raise exception 'O mês anterior não tem orçamento' using errcode = 'P0002';
  end if;

  v_current := public.create_month_budget(p_month, p_personal);

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
revoke all on function public.copy_previous_month(date, boolean) from public, anon;
grant execute on function public.copy_previous_month(date, boolean) to authenticated;
