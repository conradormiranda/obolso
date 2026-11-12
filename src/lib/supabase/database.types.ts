/**
 * Tipos do banco. Escrito à mão a partir de supabase/migrations; depois de
 * linkar o projeto, regenere com `npm run db:types` e compare.
 */

type Timestamp = string;
type Uuid = string;

export type PaidBy = "pai" | "mae" | "conjunto";
export type PaymentMethod = "pix" | "debito" | "credito" | "boleto" | "dinheiro";
export type CategoryKey =
  | "custos_fixos"
  | "conforto"
  | "metas"
  | "prazeres"
  | "liberdade_financeira"
  | "conhecimento";
export type MemberRole = "pai" | "mae";
export type AuditAction = "INSERT" | "UPDATE" | "DELETE" | "SOFT_DELETE" | "RESTORE";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Table<Row, Insert, Update> = { Row: Row; Insert: Insert; Update: Update; Relationships: [] };

type HouseholdRow = { id: Uuid; name: string; created_at: Timestamp };
type MemberRow = { household_id: Uuid; user_id: Uuid; display_name: string; role: MemberRole; created_at: Timestamp };
type CategoryRow = {
  id: Uuid;
  household_id: Uuid;
  key: CategoryKey;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
};
type BudgetRow = {
  id: Uuid;
  household_id: Uuid;
  month: string;
  created_by: Uuid;
  created_at: Timestamp;
  updated_at: Timestamp;
};
type TargetRow = { household_id: Uuid; budget_id: Uuid; category_id: Uuid; percent_bp: number };
type IncomeRow = {
  id: Uuid;
  household_id: Uuid;
  budget_id: Uuid;
  description: string;
  amount_cents: number;
  received_by: PaidBy;
  created_by: Uuid;
  created_at: Timestamp;
  updated_at: Timestamp;
};
type RecurringRow = {
  id: Uuid;
  household_id: Uuid;
  category_id: Uuid;
  description: string;
  amount_cents: number;
  paid_by: PaidBy;
  payment_method: PaymentMethod;
  active: boolean;
  starts_on: string;
  ends_on: string | null;
  created_by: Uuid;
  created_at: Timestamp;
  updated_at: Timestamp;
};
type ExpenseRow = {
  id: Uuid;
  household_id: Uuid;
  budget_id: Uuid;
  category_id: Uuid;
  description: string;
  amount_cents: number;
  expense_date: string;
  paid_by: PaidBy;
  payment_method: PaymentMethod;
  is_recurring: boolean;
  recurring_template_id: Uuid | null;
  tags: string[];
  notes: string | null;
  created_by: Uuid;
  created_at: Timestamp;
  updated_at: Timestamp;
  deleted_at: Timestamp | null;
};
type KnownDeviceRow = {
  user_id: Uuid;
  device_hash: string;
  user_agent: string;
  first_seen: Timestamp;
  last_seen: Timestamp;
};
type AuditRow = {
  id: number;
  household_id: Uuid | null;
  table_name: string;
  record_id: string;
  action: AuditAction;
  actor_id: Uuid | null;
  before: Json | null;
  after: Json | null;
  at: Timestamp;
};

/** Campos preenchidos pelo banco (defaults/triggers) ficam opcionais no insert. */
type Auto = "id" | "household_id" | "created_by" | "created_at" | "updated_at";
type InsertOf<Row, K extends keyof Row> = Omit<Row, K> & Partial<Pick<Row, K>>;

export type Database = {
  public: {
    Tables: {
      households: Table<HouseholdRow, InsertOf<HouseholdRow, "id" | "created_at">, Partial<HouseholdRow>>;
      household_members: Table<MemberRow, InsertOf<MemberRow, "created_at">, Partial<MemberRow>>;
      categories: Table<CategoryRow, InsertOf<CategoryRow, "id">, Partial<CategoryRow>>;
      monthly_budgets: Table<BudgetRow, InsertOf<BudgetRow, Auto>, Partial<BudgetRow>>;
      category_targets: Table<TargetRow, InsertOf<TargetRow, "household_id">, Partial<TargetRow>>;
      incomes: Table<IncomeRow, InsertOf<IncomeRow, Auto>, Partial<IncomeRow>>;
      recurring_templates: Table<
        RecurringRow,
        InsertOf<RecurringRow, Auto | "active" | "ends_on">,
        Partial<RecurringRow>
      >;
      expenses: Table<
        ExpenseRow,
        InsertOf<
          ExpenseRow,
          Auto | "expense_date" | "payment_method" | "is_recurring" | "recurring_template_id" | "tags" | "notes" | "deleted_at"
        >,
        Partial<ExpenseRow>
      >;
      known_devices: Table<KnownDeviceRow, InsertOf<KnownDeviceRow, "first_seen" | "last_seen">, Partial<KnownDeviceRow>>;
      audit_log: Table<AuditRow, never, never>;
    };
    Views: { [_ in never]: never };
    Functions: {
      am_i_member: { Args: Record<string, never>; Returns: boolean };
      create_month_budget: { Args: { p_month: string }; Returns: string };
      copy_previous_month: { Args: { p_month: string }; Returns: number };
      rate_limit_hit: {
        Args: { p_secret: string; p_scope: string; p_key: string };
        Returns: { allowed: boolean; retry_after_seconds: number }[];
      };
      mfa_recovery_codes_generate: { Args: Record<string, never>; Returns: string[] };
      mfa_recovery_code_consume: { Args: { p_code: string }; Returns: boolean };
      mfa_recovery_codes_remaining: { Args: Record<string, never>; Returns: number };
      mfa_recovery_codes_clear: { Args: Record<string, never>; Returns: undefined };
      admin_allow_email: { Args: { p_email: string }; Returns: undefined };
      admin_set_rate_limit_secret: { Args: { p_secret: string }; Returns: undefined };
      admin_reset_rate_limits: { Args: Record<string, never>; Returns: undefined };
      security_rls_report: {
        Args: Record<string, never>;
        Returns: {
          schema_name: string;
          table_name: string;
          rls_enabled: boolean;
          rls_forced: boolean;
          policy_count: number;
          anon_privileges: number;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
