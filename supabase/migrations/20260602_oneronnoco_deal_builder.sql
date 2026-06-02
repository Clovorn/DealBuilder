-- ============================================================================
-- OneRonnoco Deal Builder — supporting schema (additive)
-- Applied to project gmttcwimwvdupqnxbiaq. Safe to re-run (idempotent).
-- Nothing here drops or rewrites existing data; it adds the columns, tables,
-- view, and functions the rebuilt single-DB app relies on.
-- ============================================================================

-- 1) Quote lifecycle + decision/director tracking columns on deals ----------
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS quote_token text,
  ADD COLUMN IF NOT EXISTS quote_revision integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quote_cover_note text,
  ADD COLUMN IF NOT EXISTS quote_valid_until date,
  ADD COLUMN IF NOT EXISTS quote_first_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_decision_notes text,
  ADD COLUMN IF NOT EXISTS director_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS director_decision_by text,
  ADD COLUMN IF NOT EXISTS director_decision_notes text,
  ADD COLUMN IF NOT EXISTS resubmission_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deal_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS total_monthly_charged numeric,
  ADD COLUMN IF NOT EXISTS distributor_warehouse text,
  ADD COLUMN IF NOT EXISTS distributor_customer_num text,
  ADD COLUMN IF NOT EXISTS coffee_spend_3mo numeric,
  ADD COLUMN IF NOT EXISTS expected_monthly_sales numeric;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_deal_status_check') THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_deal_status_check
      CHECK (deal_status IS NULL OR deal_status IN ('active','rejected','closed','complete'));
  END IF;
END $$;

-- 2) Quote number generator: Q-YYYY-NNNN -------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq;
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n integer; yr text;
BEGIN
  n := nextval('public.quote_number_seq');
  yr := to_char(now(), 'YYYY');
  RETURN 'Q-' || yr || '-' || lpad(n::text, 4, '0');
END; $$;

-- 3) deal_bundles child table ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deal_bundles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  bundle_id uuid REFERENCES public.bundles(id),
  bundle_name text,
  target_monthly_fee numeric,
  term_months integer,
  lease_rate numeric,
  total_monthly_charged numeric,
  snapshot jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS deal_bundles_deal_id_uniq ON public.deal_bundles(deal_id);

-- 4) Native-scoping indexes --------------------------------------------------
CREATE INDEX IF NOT EXISTS deals_assigned_rep_id_idx ON public.deals(assigned_rep_id);
CREATE INDEX IF NOT EXISTS deals_customer_id_idx ON public.deals(customer_id);
CREATE INDEX IF NOT EXISTS deals_quote_token_idx ON public.deals(quote_token);
CREATE INDEX IF NOT EXISTS deals_quote_number_idx ON public.deals(quote_number);
CREATE INDEX IF NOT EXISTS leads_assigned_rep_id_idx ON public.leads(assigned_rep_id);
CREATE INDEX IF NOT EXISTS leads_customer_id_idx ON public.leads(customer_id);
CREATE INDEX IF NOT EXISTS users_director_id_idx ON public.users(director_id);

-- 5) get_my_director() — resolve the caller's director via users.director_id -
CREATE OR REPLACE FUNCTION public.get_my_director()
RETURNS TABLE (director_user_id uuid, director_name text, director_email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id, COALESCE(d.display_name, d.full_name), d.email
  FROM public.users me
  JOIN public.users d ON d.id = me.director_id
  WHERE me.id = auth.uid();
$$;

-- 6) user_profiles compatibility view over users (updatable) -----------------
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT u.id AS user_id, u.email, u.role, u.display_name, u.full_name,
       u.is_active AS active, u.director_id, u.title, u.phone,
       u.created_at, u.updated_at
FROM public.users u;

CREATE OR REPLACE FUNCTION public.user_profiles_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.users SET
    role = COALESCE(NEW.role, role),
    display_name = NEW.display_name, title = NEW.title, phone = NEW.phone,
    director_id = NEW.director_id,
    is_active = COALESCE(NEW.active, is_active), updated_at = now()
  WHERE id = OLD.user_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS user_profiles_update_trg ON public.user_profiles;
CREATE TRIGGER user_profiles_update_trg INSTEAD OF UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.user_profiles_update();

-- 7) admin_list_users() — shape the admin screen expects ---------------------
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (user_id uuid, email text, role text, display_name text,
  active boolean, director_id uuid, director_name text, title text, phone text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.id, u.email, u.role, COALESCE(u.display_name, u.full_name),
         u.is_active, u.director_id, COALESCE(d.display_name, d.full_name),
         u.title, u.phone
  FROM public.users u
  LEFT JOIN public.users d ON d.id = u.director_id
  ORDER BY COALESCE(u.display_name, u.full_name);
$$;
