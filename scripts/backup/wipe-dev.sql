-- SOMENTE PARA O ENSAIO DE RESTAURAÇÃO NO PROJETO DE DEV.
-- Apaga os dados que o backup contém, simulando a perda total.
begin;
set local session_replication_role = replica;
delete from public.audit_log;
delete from public.expenses;
delete from public.incomes;
delete from public.category_targets;
delete from public.recurring_templates;
delete from public.monthly_budgets;
delete from public.known_devices;
delete from public.household_members;
delete from public.categories;
delete from public.households;
delete from app_private.mfa_recovery_codes;
delete from app_private.allowed_emails;
delete from app_private.config;
delete from app_private.rate_limits;
delete from auth.mfa_factors;
delete from auth.identities;
delete from auth.users;
commit;
