-- =====================================================================
-- Tipo de consumo (bares e restaurantes, mercado, transporte…), além da
-- seção do orçamento. Opcional; a lista é fixa (check) e espelha
-- src/lib/domain/consumption.ts. O import do mês anterior passa a copiá-lo.
-- =====================================================================

alter table public.expenses
  add column consumption text null check (consumption is null or consumption in ('mercado', 'bares_restaurantes', 'delivery', 'moradia_contas', 'saude', 'transporte', 'assinaturas', 'cuidados_pessoais', 'pets', 'casa', 'compras', 'lazer', 'viagem', 'educacao', 'investimentos', 'servicos', 'outros'));

create or replace function public.import_previous_month(p_month date, p_personal boolean default false)
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
                               paid_by, payment_method, tags, notes, consumption, imported_from)
  select v_household, v_current, e.category_id, e.description, e.amount_cents,
         least(p_month + (extract(day from e.expense_date)::integer - 1), v_last_day),
         e.paid_by, e.payment_method, e.tags, e.notes, e.consumption, e.id
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
                               paid_by, payment_method, tags, notes, consumption,
                               installment_number, installment_total, installment_group, imported_from)
  select v_household, v_current, e.category_id, e.description, e.amount_cents,
         least(p_month + (extract(day from e.expense_date)::integer - 1), v_last_day),
         e.paid_by, e.payment_method, e.tags, e.notes, e.consumption,
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
