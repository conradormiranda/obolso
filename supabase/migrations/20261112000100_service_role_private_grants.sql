-- A service_role (script de setup e fixtures de teste) também passa pelos
-- CHECKs e DEFAULTs que chamam funções de app_private. Ela precisa de USAGE no
-- schema e EXECUTE nessas funções. Não concede acesso às tabelas privadas.
grant usage on schema app_private to service_role;
grant execute on function app_private.is_safe_text(text, int, int) to service_role;
grant execute on function app_private.is_valid_tags(text[]) to service_role;
grant execute on function app_private.my_household_id() to service_role;
grant execute on function app_private.is_member_aal2(uuid) to service_role;
