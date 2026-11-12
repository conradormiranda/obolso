-- =====================================================================
-- O Bolso — Fase 1: fundação e segurança
-- Schema completo, RLS (forçado) em todas as tabelas, auditoria
-- append-only, rate limit, códigos de recuperação de MFA e hook que
-- bloqueia criação de usuários fora da allowlist.
--
-- Convenções:
--   * Dinheiro: bigint em centavos, sempre > 0 e <= 100.000.000.000
--     (R$ 1 bilhão). Nunca float/numeric.
--   * Percentuais: basis points (4000 = 40%).
--   * Toda política exige membro do household E sessão aal2 (MFA).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Privilégios padrão: nada é concedido automaticamente a anon/authenticated
-- ---------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated, public;

-- Schema privado: não exposto pela API (PostgREST só expõe public/graphql_public).
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
-- RLS executa como o papel da requisição; ele precisa de USAGE para chamar os helpers.
grant usage on schema app_private to authenticated;

-- ---------------------------------------------------------------------
-- Funções auxiliares de validação (imutáveis, usadas em CHECKs)
-- ---------------------------------------------------------------------
create function app_private.is_safe_text(p text, p_min int, p_max int)
returns boolean language sql immutable set search_path = ''
as $$
  select p is not null
     and char_length(p) between p_min and p_max
     and p = btrim(p)
     and p !~ '[<>]'
     and p !~ '[[:cntrl:]]'
$$;

create function app_private.is_valid_tags(p text[])
returns boolean language sql immutable set search_path = ''
as $$
  select p is not null
     and cardinality(p) <= 10
     and coalesce((select bool_and(app_private.is_safe_text(t, 1, 30)) from unnest(p) as t), true)
$$;

-- =====================================================================
-- Tabelas
-- =====================================================================

create table public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (app_private.is_safe_text(name, 1, 80)),
  created_at timestamptz not null default now()
);
-- Apenas um household pode existir.
create unique index households_singleton on public.households ((true));

create table public.household_members (
  household_id uuid not null references public.households (id) on delete restrict,
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  display_name text not null check (app_private.is_safe_text(display_name, 1, 60)),
  role         text not null check (role in ('pai', 'mae')),
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  -- household único + 2 papéis possíveis => no máximo 2 membros.
  unique (household_id, role)
);

-- ---------------------------------------------------------------------
-- Helpers de autorização (security definer: leem household_members sem RLS)
-- ---------------------------------------------------------------------
create function app_private.my_household_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select m.household_id from public.household_members m where m.user_id = auth.uid()
$$;

create function app_private.is_member_aal2(p_household uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.household_members m
       where m.user_id = auth.uid() and m.household_id = p_household
     )
$$;

revoke all on function app_private.my_household_id() from public;
revoke all on function app_private.is_member_aal2(uuid) from public;
revoke all on function app_private.is_safe_text(text, int, int) from public;
revoke all on function app_private.is_valid_tags(text[]) from public;
grant execute on function app_private.my_household_id() to authenticated;
grant execute on function app_private.is_member_aal2(uuid) to authenticated;
grant execute on function app_private.is_safe_text(text, int, int) to authenticated;
grant execute on function app_private.is_valid_tags(text[]) to authenticated;

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  key          text not null check (key in ('custos_fixos', 'conforto', 'metas', 'prazeres', 'liberdade_financeira', 'conhecimento')),
  name         text not null check (app_private.is_safe_text(name, 1, 40)),
  icon         text not null check (icon ~ '^[a-z0-9-]{1,40}$'),
  color        text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order   smallint not null check (sort_order between 1 and 6),
  unique (household_id, key),
  unique (household_id, sort_order),
  unique (household_id, id)
);

create table public.monthly_budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default app_private.my_household_id() references public.households (id) on delete restrict,
  month        date not null check (extract(day from month) = 1),
  created_by   uuid not null references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, month),
  unique (household_id, id)
);

create table public.category_targets (
  household_id uuid not null default app_private.my_household_id(),
  budget_id    uuid not null,
  category_id  uuid not null,
  percent_bp   integer not null check (percent_bp between 0 and 10000),
  primary key (budget_id, category_id),
  foreign key (household_id, budget_id) references public.monthly_budgets (household_id, id) on delete cascade,
  foreign key (household_id, category_id) references public.categories (household_id, id) on delete restrict
);

create table public.incomes (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default app_private.my_household_id(),
  budget_id     uuid not null,
  description   text not null check (app_private.is_safe_text(description, 1, 120)),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  received_by   text not null check (received_by in ('pai', 'mae', 'conjunto')),
  created_by    uuid not null references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (household_id, budget_id) references public.monthly_budgets (household_id, id) on delete cascade
);
create index incomes_budget_idx on public.incomes (budget_id);

create table public.recurring_templates (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default app_private.my_household_id(),
  category_id    uuid not null,
  description    text not null check (app_private.is_safe_text(description, 1, 120)),
  amount_cents   bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  paid_by        text not null check (paid_by in ('pai', 'mae', 'conjunto')),
  payment_method text not null check (payment_method in ('pix', 'debito', 'credito', 'boleto', 'dinheiro')),
  active         boolean not null default true,
  starts_on      date not null,
  ends_on        date null,
  created_by     uuid not null references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (household_id, id),
  foreign key (household_id, category_id) references public.categories (household_id, id) on delete restrict
);

create table public.expenses (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null default app_private.my_household_id(),
  budget_id             uuid not null,
  category_id           uuid not null,
  description           text not null check (app_private.is_safe_text(description, 1, 120)),
  amount_cents          bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  expense_date          date not null default current_date,
  paid_by               text not null check (paid_by in ('pai', 'mae', 'conjunto')),
  payment_method        text not null default 'pix' check (payment_method in ('pix', 'debito', 'credito', 'boleto', 'dinheiro')),
  is_recurring          boolean not null default false,
  recurring_template_id uuid null,
  tags                  text[] not null default '{}' check (app_private.is_valid_tags(tags)),
  notes                 text null check (notes is null or app_private.is_safe_text(notes, 1, 1000)),
  created_by            uuid not null references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz null,
  foreign key (household_id, budget_id) references public.monthly_budgets (household_id, id) on delete restrict,
  foreign key (household_id, category_id) references public.categories (household_id, id) on delete restrict,
  foreign key (household_id, recurring_template_id) references public.recurring_templates (household_id, id) on delete set null (recurring_template_id)
);
create index expenses_budget_idx on public.expenses (budget_id) where deleted_at is null;
create index expenses_deleted_idx on public.expenses (deleted_at) where deleted_at is not null;

-- Dispositivos conhecidos (para alerta de login em dispositivo novo).
create table public.known_devices (
  user_id     uuid not null references auth.users (id) on delete cascade,
  device_hash text not null check (device_hash ~ '^[a-f0-9]{64}$'),
  user_agent  text not null check (char_length(user_agent) <= 300),
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  primary key (user_id, device_hash)
);

create table public.audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid null,
  table_name   text not null,
  record_id    text not null,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE')),
  actor_id     uuid null,
  before       jsonb null,
  after        jsonb null,
  at           timestamptz not null default now()
);
create index audit_log_household_at_idx on public.audit_log (household_id, at desc);

-- ---------------------------------------------------------------------
-- Tabelas privadas (sem acesso via API; só funções security definer)
-- ---------------------------------------------------------------------
create table app_private.allowed_emails (
  email text primary key check (email = lower(email))
);

create table app_private.config (
  key   text primary key,
  value text not null
);

create table app_private.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  attempts     integer not null default 0,
  locked_until timestamptz null,
  lockouts     integer not null default 0,
  updated_at   timestamptz not null default now()
);

create table app_private.mfa_recovery_codes (
  id        bigint generated always as identity primary key,
  user_id   uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  created_at timestamptz not null default now(),
  used_at   timestamptz null
);
create index mfa_recovery_codes_user_idx on app_private.mfa_recovery_codes (user_id);

-- =====================================================================
-- Triggers de integridade
-- =====================================================================

-- Metadados imutáveis: id, household, autor e criação nunca mudam.
create function app_private.set_row_meta()
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
  end if;
  return new;
end
$$;

create trigger monthly_budgets_meta before insert or update on public.monthly_budgets
  for each row execute function app_private.set_row_meta();
create trigger incomes_meta before insert or update on public.incomes
  for each row execute function app_private.set_row_meta();
create trigger recurring_templates_meta before insert or update on public.recurring_templates
  for each row execute function app_private.set_row_meta();
create trigger expenses_meta before insert or update on public.expenses
  for each row execute function app_private.set_row_meta();

-- Mês do orçamento não muda depois de criado.
create function app_private.budget_month_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.month <> old.month then
    raise exception 'O mês de um orçamento não pode ser alterado' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger monthly_budgets_month_immutable before update on public.monthly_budgets
  for each row execute function app_private.budget_month_immutable();

-- Exclusão lógica: lançamento excluído não pode ser editado; restauração só até 30 dias.
create function app_private.expenses_soft_delete_rules()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    if new.deleted_at is not null then
      raise exception 'Lançamento excluído não pode ser editado' using errcode = '23514';
    end if;
    if old.deleted_at < now() - interval '30 days' then
      raise exception 'Prazo de restauração (30 dias) expirado' using errcode = '23514';
    end if;
  elsif new.deleted_at is not null then
    new.deleted_at := now();
  end if;
  return new;
end
$$;
create trigger expenses_soft_delete before update on public.expenses
  for each row execute function app_private.expenses_soft_delete_rules();

-- Metas de um mês: exatamente 6 categorias somando 10000 bp (100%).
create function app_private.check_targets_sum()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_budget uuid;
  v_sum    bigint;
  v_count  integer;
begin
  if tg_op = 'DELETE' then
    v_budget := old.budget_id;
  else
    v_budget := new.budget_id;
  end if;
  if not exists (select 1 from public.monthly_budgets b where b.id = v_budget) then
    return null;
  end if;
  select coalesce(sum(t.percent_bp), 0), count(*) into v_sum, v_count
  from public.category_targets t where t.budget_id = v_budget;
  if v_count > 0 and (v_count <> 6 or v_sum <> 10000) then
    raise exception 'As metas do mês devem ter 6 categorias e somar exatamente 100%%' using errcode = '23514';
  end if;
  return null;
end
$$;
create constraint trigger category_targets_sum
  after insert or update or delete on public.category_targets
  deferrable initially deferred
  for each row execute function app_private.check_targets_sum();

create function app_private.targets_keys_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.budget_id <> old.budget_id or new.category_id <> old.category_id or new.household_id <> old.household_id then
    raise exception 'Chaves da meta não podem ser alteradas' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger category_targets_keys before update on public.category_targets
  for each row execute function app_private.targets_keys_immutable();

-- =====================================================================
-- Auditoria (append only)
-- =====================================================================
create function app_private.audit_trigger()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
  v_action text := tg_op;
  v_hh     uuid;
  v_id     text;
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
  v_id := coalesce(
    v_row ->> 'id',
    case when v_row ? 'budget_id' and v_row ? 'category_id' then (v_row ->> 'budget_id') || ':' || (v_row ->> 'category_id') end,
    v_row ->> 'user_id'
  );

  insert into public.audit_log (household_id, table_name, record_id, action, actor_id, before, after)
  values (v_hh, tg_table_name, v_id, v_action, auth.uid(), v_before, v_after);
  return null;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['households', 'household_members', 'categories', 'monthly_budgets',
                           'category_targets', 'incomes', 'recurring_templates', 'expenses']
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function app_private.audit_trigger()',
      t || '_audit', t);
  end loop;
end
$$;

create function app_private.audit_log_immutable()
returns trigger language plpgsql set search_path = ''
as $$
begin
  raise exception 'audit_log é somente inclusão (append only)' using errcode = '42501';
end
$$;
create trigger audit_log_no_update_delete before update or delete on public.audit_log
  for each row execute function app_private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function app_private.audit_log_immutable();

-- =====================================================================
-- RLS: habilitado e forçado em TODAS as tabelas
-- =====================================================================
do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_tables where schemaname in ('public', 'app_private')
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('alter table %I.%I force row level security', r.schemaname, r.tablename);
  end loop;
end
$$;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all tables in schema app_private from anon, authenticated;

grant select on public.households, public.household_members, public.categories to authenticated;
grant update (display_name) on public.household_members to authenticated;
grant select, insert, update on public.monthly_budgets to authenticated;
grant select, insert, update on public.category_targets to authenticated;
grant select, insert, update, delete on public.incomes to authenticated;
grant select, insert, update, delete on public.recurring_templates to authenticated;
grant select, insert, update on public.expenses to authenticated; -- sem DELETE: exclusão é lógica
grant select, insert, update on public.known_devices to authenticated;
grant select on public.audit_log to authenticated;

-- households
create policy households_select on public.households for select to authenticated
  using (app_private.is_member_aal2(id));

-- household_members
create policy members_select on public.household_members for select to authenticated
  using (app_private.is_member_aal2(household_id));
create policy members_update_self on public.household_members for update to authenticated
  using (user_id = auth.uid() and app_private.is_member_aal2(household_id))
  with check (user_id = auth.uid() and app_private.is_member_aal2(household_id));

-- categories
create policy categories_select on public.categories for select to authenticated
  using (app_private.is_member_aal2(household_id));

-- tabelas de negócio com household_id
do $$
declare t text;
begin
  foreach t in array array['monthly_budgets', 'category_targets', 'incomes', 'recurring_templates', 'expenses']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (app_private.is_member_aal2(household_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (app_private.is_member_aal2(household_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (app_private.is_member_aal2(household_id)) with check (app_private.is_member_aal2(household_id))', t || '_update', t);
  end loop;
  foreach t in array array['incomes', 'recurring_templates']
  loop
    execute format('create policy %I on public.%I for delete to authenticated using (app_private.is_member_aal2(household_id))', t || '_delete', t);
  end loop;
end
$$;

-- known_devices: cada usuário só vê os próprios dispositivos
create policy known_devices_select on public.known_devices for select to authenticated
  using (user_id = auth.uid() and app_private.is_member_aal2(app_private.my_household_id()));
create policy known_devices_insert on public.known_devices for insert to authenticated
  with check (user_id = auth.uid() and app_private.is_member_aal2(app_private.my_household_id()));
create policy known_devices_update on public.known_devices for update to authenticated
  using (user_id = auth.uid() and app_private.is_member_aal2(app_private.my_household_id()))
  with check (user_id = auth.uid() and app_private.is_member_aal2(app_private.my_household_id()));

-- audit_log: somente leitura para membros
create policy audit_log_select on public.audit_log for select to authenticated
  using (app_private.is_member_aal2(household_id));

-- =====================================================================
-- Funções expostas (RPC)
-- =====================================================================

-- Usuário logado (qualquer AAL) está na allowlist? Só revela sobre si mesmo.
create function public.am_i_member()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from public.household_members m where m.user_id = auth.uid())
$$;
revoke all on function public.am_i_member() from public, anon;
grant execute on function public.am_i_member() to authenticated;

-- Rate limit com bloqueio progressivo. Exige o segredo do servidor, para que
-- a função não possa ser chamada diretamente pela API pública.
create function public.rate_limit_hit(p_secret text, p_scope text, p_key text)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_max     integer;
  v_window  interval;
  v_start   timestamptz;
  v_attempts integer;
  v_locked  timestamptz;
  v_lockouts integer;
  v_full    text;
  v_lock    interval;
begin
  if p_secret is null
     or not exists (
       select 1 from app_private.config c
       where c.key = 'rate_limit_secret_sha256'
         and c.value = encode(extensions.digest(p_secret, 'sha256'), 'hex')
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_key !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid key' using errcode = '22023';
  end if;

  case p_scope
    when 'login_ip'       then v_max := 5;  v_window := interval '15 minutes';
    when 'login_email'    then v_max := 5;  v_window := interval '15 minutes';
    when 'mfa_user'       then v_max := 5;  v_window := interval '15 minutes';
    when 'mfa_ip'         then v_max := 10; v_window := interval '15 minutes';
    when 'recovery_ip'    then v_max := 5;  v_window := interval '15 minutes';
    when 'recovery_email' then v_max := 3;  v_window := interval '15 minutes';
    else raise exception 'invalid scope' using errcode = '22023';
  end case;

  v_full := p_scope || ':' || p_key;
  insert into app_private.rate_limits (key) values (v_full) on conflict (key) do nothing;
  select r.window_start, r.attempts, r.locked_until, r.lockouts
    into v_start, v_attempts, v_locked, v_lockouts
    from app_private.rate_limits r where r.key = v_full for update;

  if v_locked is not null and v_locked > now() then
    return query select false, ceil(extract(epoch from v_locked - now()))::integer;
    return;
  end if;

  -- Bloqueios antigos (> 24h) deixam de contar para a progressão.
  if v_locked is not null and v_locked < now() - interval '24 hours' then
    v_lockouts := 0;
  end if;

  if v_start + v_window < now() then
    v_start := now();
    v_attempts := 0;
  end if;

  v_attempts := v_attempts + 1;

  if v_attempts > v_max then
    v_lockouts := v_lockouts + 1;
    v_lock := least(v_window * power(2, v_lockouts - 1)::integer, interval '24 hours');
    update app_private.rate_limits r
       set locked_until = now() + v_lock, attempts = 0, window_start = now(),
           lockouts = v_lockouts, updated_at = now()
     where r.key = v_full;
    return query select false, ceil(extract(epoch from v_lock))::integer;
    return;
  end if;

  update app_private.rate_limits r
     set attempts = v_attempts, window_start = v_start,
         lockouts = v_lockouts, updated_at = now()
   where r.key = v_full;
  return query select true, 0;
end
$$;
revoke all on function public.rate_limit_hit(text, text, text) from public;
grant execute on function public.rate_limit_hit(text, text, text) to anon, authenticated;

-- Gera 10 códigos de recuperação (substitui os anteriores). Exige aal2.
create function public.mfa_recovery_codes_generate()
returns setof text language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i integer;
  j integer;
begin
  if not app_private.is_member_aal2(app_private.my_household_id()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from app_private.mfa_recovery_codes where user_id = auth.uid();
  for i in 1..10 loop
    v_bytes := extensions.gen_random_bytes(10);
    v_code := '';
    for j in 0..9 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, j) % length(v_alphabet)) + 1, 1);
      if j = 4 then v_code := v_code || '-'; end if;
    end loop;
    insert into app_private.mfa_recovery_codes (user_id, code_hash)
    values (auth.uid(), encode(extensions.digest(v_code, 'sha256'), 'hex'));
    return next v_code;
  end loop;
end
$$;
revoke all on function public.mfa_recovery_codes_generate() from public, anon;
grant execute on function public.mfa_recovery_codes_generate() to authenticated;

-- Consome um código de recuperação: remove os fatores TOTP do próprio usuário,
-- que então precisa configurar um novo autenticador. Exige sessão (aal1) e membro.
create function public.mfa_recovery_code_consume(p_code text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if auth.uid() is null or not exists (select 1 from public.household_members m where m.user_id = auth.uid()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select c.id into v_id from app_private.mfa_recovery_codes c
   where c.user_id = auth.uid() and c.used_at is null
     and c.code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
   limit 1
   for update;
  if v_id is null then
    return false;
  end if;
  update app_private.mfa_recovery_codes set used_at = now() where id = v_id;
  delete from auth.mfa_factors where user_id = auth.uid();
  return true;
end
$$;
revoke all on function public.mfa_recovery_code_consume(text) from public, anon;
grant execute on function public.mfa_recovery_code_consume(text) to authenticated;

-- Quantos códigos de recuperação ainda restam (para a tela de configurações).
create function public.mfa_recovery_codes_remaining()
returns integer language sql stable security definer set search_path = ''
as $$
  select count(*)::integer from app_private.mfa_recovery_codes
   where user_id = auth.uid() and used_at is null
$$;
revoke all on function public.mfa_recovery_codes_remaining() from public, anon;
grant execute on function public.mfa_recovery_codes_remaining() to authenticated;

-- ---------------------------------------------------------------------
-- Funções administrativas: somente service_role (scripts locais e testes)
-- ---------------------------------------------------------------------
create function public.admin_allow_email(p_email text)
returns void language sql volatile security definer set search_path = ''
as $$
  insert into app_private.allowed_emails (email) values (lower(btrim(p_email))) on conflict do nothing
$$;
revoke all on function public.admin_allow_email(text) from public, anon, authenticated;
grant execute on function public.admin_allow_email(text) to service_role;

create function public.admin_set_rate_limit_secret(p_secret text)
returns void language plpgsql volatile security definer set search_path = ''
as $$
begin
  if char_length(p_secret) < 32 then
    raise exception 'segredo muito curto' using errcode = '22023';
  end if;
  insert into app_private.config (key, value)
  values ('rate_limit_secret_sha256', encode(extensions.digest(p_secret, 'sha256'), 'hex'))
  on conflict (key) do update set value = excluded.value;
end
$$;
revoke all on function public.admin_set_rate_limit_secret(text) from public, anon, authenticated;
grant execute on function public.admin_set_rate_limit_secret(text) to service_role;

-- Relatório usado pelos testes de segurança: RLS/FORCE/políticas por tabela.
create function public.security_rls_report()
returns table (schema_name text, table_name text, rls_enabled boolean, rls_forced boolean, policy_count integer, anon_privileges integer)
language sql stable security definer set search_path = ''
as $$
  select n.nspname::text, c.relname::text, c.relrowsecurity, c.relforcerowsecurity,
         (select count(*)::integer from pg_catalog.pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname),
         (select count(*)::integer from information_schema.role_table_grants g
           where g.table_schema = n.nspname and g.table_name = c.relname and g.grantee = 'anon')
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.relkind in ('r', 'p') and n.nspname in ('public', 'app_private')
   order by 1, 2
$$;
revoke all on function public.security_rls_report() from public, anon, authenticated;
grant execute on function public.security_rls_report() to service_role;

-- Testes: zera contadores de rate limit (somente service_role).
create function public.admin_reset_rate_limits()
returns void language sql volatile security definer set search_path = ''
as $$ delete from app_private.rate_limits where true $$;
revoke all on function public.admin_reset_rate_limits() from public, anon, authenticated;
grant execute on function public.admin_reset_rate_limits() to service_role;

-- ---------------------------------------------------------------------
-- Hook de Auth: rejeita a criação de qualquer usuário fora da allowlist.
-- (4ª camada além de signup desativado, allowlist no middleware e RLS.)
-- ---------------------------------------------------------------------
create function public.hook_before_user_created(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(event -> 'user' ->> 'email', '')));
begin
  if v_email = '' or not exists (select 1 from app_private.allowed_emails a where a.email = v_email) then
    return jsonb_build_object('error', jsonb_build_object('message', 'Cadastro desativado', 'http_code', 403));
  end if;
  return '{}'::jsonb;
end
$$;
revoke all on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema app_private to supabase_auth_admin;
grant select on app_private.allowed_emails to supabase_auth_admin;
create policy allowed_emails_auth_admin on app_private.allowed_emails for select to supabase_auth_admin using (true);

-- ---------------------------------------------------------------------
-- Manutenção agendada (pg_cron): purga lançamentos excluídos há > 30 dias
-- e limpa contadores de rate limit antigos.
-- ---------------------------------------------------------------------
create function app_private.purge_deleted_expenses()
returns void language sql volatile security definer set search_path = ''
as $$
  delete from public.expenses where deleted_at is not null and deleted_at < now() - interval '30 days'
$$;

create function app_private.cleanup_rate_limits()
returns void language sql volatile security definer set search_path = ''
as $$
  delete from app_private.rate_limits
   where updated_at < now() - interval '2 days'
     and (locked_until is null or locked_until < now())
$$;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('obolso-purge-deleted-expenses', '17 3 * * *', 'select app_private.purge_deleted_expenses()');
select cron.schedule('obolso-cleanup-rate-limits', '23 * * * *', 'select app_private.cleanup_rate_limits()');
