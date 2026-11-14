-- =====================================================================
-- Compras parceladas + importar do mês anterior
--   * expenses ganha parcela atual / total / grupo (todas as parcelas da
--     mesma compra compartilham o grupo)
--   * import_previous_month: copia os "Custos fixos" do mês anterior
--     (mesmo valor) e a PRÓXIMA parcela de cada compra parcelada.
--     Idempotente: imported_from impede importar a mesma origem duas vezes.
-- =====================================================================

alter table public.expenses
  add column installment_number smallint null,
  add column installment_total  smallint null,
  add column installment_group  uuid null,
  add column imported_from      uuid null;

alter table public.expenses add constraint expenses_installments_check check (
  (installment_number is null and installment_total is null and installment_group is null)
  or (installment_number is not null and installment_total is not null
      and installment_total between 2 and 120
      and installment_number between 1 and installment_total)
);

create unique index expenses_imported_once
  on public.expenses (budget_id, imported_from) where imported_from is not null;
create index expenses_installment_group_idx on public.expenses (installment_group) where installment_group is not null;

-- Compra parcelada nova recebe um grupo automaticamente.
create function app_private.installment_group_default()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.installment_total is not null and new.installment_group is null then
    new.installment_group := gen_random_uuid();
  end if;
  if new.installment_total is null then
    new.installment_number := null;
    new.installment_group := null;
  end if;
  return new;
end
$$;
create trigger expenses_installment_group before insert or update on public.expenses
  for each row execute function app_private.installment_group_default();

create function public.import_previous_month(p_month date, p_personal boolean default false)
returns jsonb language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_household uuid := app_private.my_household_id();
  v_owner     uuid := case when p_personal then auth.uid() else null end;
  v_previous  uuid;
  v_current   uuid;
  v_last_day  date;
  v_fixed     integer;
  v_parcels   integer;
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
  v_last_day := (p_month + interval '1 month' - interval '1 day')::date;

  -- 1) Despesas fixas: tudo de "Custos fixos" que não é parcela, sem repetir
  --    (nem o que já veio dos recorrentes com a mesma descrição).
  insert into public.expenses (household_id, budget_id, category_id, description, amount_cents, expense_date,
                               paid_by, payment_method, tags, notes, imported_from)
  select v_household, v_current, e.category_id, e.description, e.amount_cents,
         least(p_month + (extract(day from e.expense_date)::integer - 1), v_last_day),
         e.paid_by, e.payment_method, e.tags, e.notes, e.id
    from public.expenses e
    join public.categories c on c.id = e.category_id
   where e.budget_id = v_previous
     and e.deleted_at is null
     and c.key = 'custos_fixos'
     and e.installment_total is null
     and not exists (select 1 from public.expenses x where x.budget_id = v_current and x.imported_from = e.id)
     and not exists (
       select 1 from public.expenses x
        where x.budget_id = v_current and x.deleted_at is null
          and x.category_id = e.category_id and lower(x.description) = lower(e.description)
     );
  get diagnostics v_fixed = row_count;

  -- 2) Próxima parcela de cada compra parcelada que ainda não terminou.
  insert into public.expenses (household_id, budget_id, category_id, description, amount_cents, expense_date,
                               paid_by, payment_method, tags, notes,
                               installment_number, installment_total, installment_group, imported_from)
  select v_household, v_current, e.category_id, e.description, e.amount_cents,
         least(p_month + (extract(day from e.expense_date)::integer - 1), v_last_day),
         e.paid_by, e.payment_method, e.tags, e.notes,
         e.installment_number + 1, e.installment_total, e.installment_group, e.id
    from public.expenses e
   where e.budget_id = v_previous
     and e.deleted_at is null
     and e.installment_total is not null
     and e.installment_number < e.installment_total
     and not exists (select 1 from public.expenses x where x.budget_id = v_current and x.imported_from = e.id)
     and not exists (
       select 1 from public.expenses x
        where x.budget_id = v_current and x.installment_group = e.installment_group
          and x.installment_number = e.installment_number + 1
     );
  get diagnostics v_parcels = row_count;

  return jsonb_build_object('fixed', v_fixed, 'installments', v_parcels);
end
$$;
revoke all on function public.import_previous_month(date, boolean) from public, anon;
grant execute on function public.import_previous_month(date, boolean) to authenticated;
