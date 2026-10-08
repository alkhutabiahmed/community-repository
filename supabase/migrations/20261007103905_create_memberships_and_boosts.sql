/*
# Memberships, boosts and proposal upgrades

Plain-English: Adds paid plans (PROPOSAL+, TONIGHT, BLACK), one-off visibility boosts and
upgraded proposals (Priority, Super, VIP). Everything a member pays for is granted only by the
payment system on the server - members can never give themselves a plan, a boost or credits.

1. Modified Tables
- `profiles`
  - `plan` (text: free/plus/tonight/black) - current paid plan.
  - `plan_until` (timestamptz) - plan is active until this moment (renewed by each payment).
  - `boost_until` (timestamptz) - profile is boosted (shown first) until this moment.
  - `boost_kind` (text: local/tonight/weekend/city) - which boost is active.
  These columns are NOT writable by members (no column grant).
- `proposals`
  - `tier` (text: normal/priority/super/vip) - upgraded proposals appear first in inboxes and
    have a special look. Using a paid tier spends one matching credit.

2. New Tables
- `member_credits` - one row per member: priority, super, vip proposal credits and boosts.
- `member_purchases` - ledger of fulfilled purchases and monthly plan grants; the unique
  `reference` makes fulfilment safe to repeat (no double credits).

3. New Functions
- `fulfill_purchase` (server only) - grants a one-off product after a successful payment.
- `apply_subscription` (server only) - sets the plan from the payment system and grants the
  monthly perks (TONIGHT: 15 Priority Proposals + 4 boosts; BLACK: 15 Priority + 4 VIP + 4 boosts).
- `activate_boost` (members) - spends one included boost for a Tonight Boost.
- `get_my_membership` (members) - the caller's plan, boost, credits and daily proposal usage.
- Proposal guard trigger: free members can start 3 proposals per 24h, PROPOSAL+ 20,
  TONIGHT/BLACK unlimited; paid tiers require and spend a credit.

4. Security
- RLS on both new tables; members can only read their own rows; no client writes at all.
- Server-only functions are executable by the service role only.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boost_until timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS boost_kind text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'normal';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_plan_check CHECK (plan IN ('free','plus','tonight','black'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_boost_kind_check') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_boost_kind_check CHECK (boost_kind IS NULL OR boost_kind IN ('local','tonight','weekend','city'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'proposals_tier_check') THEN
    ALTER TABLE proposals ADD CONSTRAINT proposals_tier_check CHECK (tier IN ('normal','priority','super','vip'));
  END IF;
END $$;

GRANT INSERT (tier) ON proposals TO authenticated;

CREATE TABLE IF NOT EXISTS member_credits (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 0 CHECK (priority >= 0),
  super int NOT NULL DEFAULT 0 CHECK (super >= 0),
  vip int NOT NULL DEFAULT 0 CHECK (vip >= 0),
  boosts int NOT NULL DEFAULT 0 CHECK (boosts >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product text NOT NULL,
  reference text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_purchases_user_idx ON member_purchases(user_id, created_at DESC);

ALTER TABLE member_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own credits" ON member_credits;
CREATE POLICY "Members read own credits" ON member_credits FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Members read own purchases" ON member_purchases;
CREATE POLICY "Members read own purchases" ON member_purchases FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON member_credits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON member_purchases FROM anon, authenticated;

CREATE OR REPLACE FUNCTION effective_plan(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT CASE WHEN plan_until > now() THEN plan ELSE 'free' END FROM profiles WHERE id = p_user), 'free');
$$;

CREATE OR REPLACE FUNCTION next_night_end()
RETURNS timestamptz LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT (date_trunc('day', now() AT TIME ZONE 'Europe/Brussels') + interval '3 hours'
    + CASE WHEN extract(hour FROM now() AT TIME ZONE 'Europe/Brussels') >= 3 THEN interval '1 day' ELSE interval '0' END)
    AT TIME ZONE 'Europe/Brussels';
$$;

CREATE OR REPLACE FUNCTION apply_boost(p_user uuid, p_kind text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
  UPDATE profiles SET
    boost_until = CASE p_kind
      WHEN 'tonight' THEN greatest(coalesce(boost_until, now()), next_night_end())
      WHEN 'local' THEN greatest(coalesce(boost_until, now()), now()) + interval '2 hours'
      WHEN 'weekend' THEN greatest(coalesce(boost_until, now()), now()) + interval '48 hours'
      WHEN 'city' THEN greatest(coalesce(boost_until, now()), now()) + interval '6 hours'
    END,
    boost_kind = CASE WHEN p_kind = 'city' OR boost_until IS NULL OR boost_until < now() THEN p_kind ELSE boost_kind END
  WHERE id = p_user
  RETURNING boost_until INTO v_until;
  IF v_until IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION fulfill_purchase(p_customer text, p_product text, p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM stripe_customers WHERE customer_id = p_customer AND deleted_at IS NULL;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unknown customer'; END IF;
  IF p_product NOT IN ('priority_proposal','super_proposal','vip_proposal','boost_2h','tonight_boost','weekend_boost','city_boost') THEN
    RAISE EXCEPTION 'Unknown product';
  END IF;

  INSERT INTO member_purchases (user_id, product, reference) VALUES (v_user, p_product, p_reference)
  ON CONFLICT (reference) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO member_credits (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
  CASE p_product
    WHEN 'priority_proposal' THEN UPDATE member_credits SET priority = priority + 1, updated_at = now() WHERE user_id = v_user;
    WHEN 'super_proposal' THEN UPDATE member_credits SET super = super + 1, updated_at = now() WHERE user_id = v_user;
    WHEN 'vip_proposal' THEN UPDATE member_credits SET vip = vip + 1, updated_at = now() WHERE user_id = v_user;
    WHEN 'boost_2h' THEN PERFORM apply_boost(v_user, 'local');
    WHEN 'tonight_boost' THEN PERFORM apply_boost(v_user, 'tonight');
    WHEN 'weekend_boost' THEN PERFORM apply_boost(v_user, 'weekend');
    WHEN 'city_boost' THEN PERFORM apply_boost(v_user, 'city');
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION apply_subscription(p_customer text, p_subscription_id text, p_plan text, p_status text, p_period_start bigint, p_period_end bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  SELECT user_id INTO v_user FROM stripe_customers WHERE customer_id = p_customer AND deleted_at IS NULL;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Unknown customer'; END IF;

  IF p_status IN ('active','trialing','past_due') AND p_plan IN ('plus','tonight','black') AND p_period_end IS NOT NULL THEN
    UPDATE profiles SET plan = p_plan, plan_until = to_timestamp(p_period_end) + interval '1 day' WHERE id = v_user;
    IF p_plan IN ('tonight','black') AND p_status IN ('active','trialing') THEN
      INSERT INTO member_purchases (user_id, product, reference)
      VALUES (v_user, 'plan_' || p_plan, 'sub:' || p_subscription_id || ':' || p_period_start || ':' || p_plan)
      ON CONFLICT (reference) DO NOTHING;
      IF FOUND THEN
        INSERT INTO member_credits (user_id) VALUES (v_user) ON CONFLICT (user_id) DO NOTHING;
        UPDATE member_credits SET priority = priority + 15, boosts = boosts + 4,
          vip = vip + CASE WHEN p_plan = 'black' THEN 4 ELSE 0 END, updated_at = now()
        WHERE user_id = v_user;
      END IF;
    END IF;
  ELSE
    UPDATE profiles SET plan = 'free', plan_until = NULL WHERE id = v_user;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION activate_boost()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE member_credits SET boosts = boosts - 1, updated_at = now() WHERE user_id = auth.uid() AND boosts > 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_CREDIT'; END IF;
  RETURN apply_boost(auth.uid(), 'tonight');
END;
$$;

CREATE OR REPLACE FUNCTION proposal_daily_limit(p_plan text)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_plan WHEN 'free' THEN 3 WHEN 'plus' THEN 20 ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION get_my_membership()
RETURNS TABLE (plan text, plan_until timestamptz, boost_until timestamptz, boost_kind text,
               priority int, super int, vip int, boosts int, sent_today int, daily_limit int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  v_plan := effective_plan(auth.uid());
  RETURN QUERY
  SELECT v_plan, CASE WHEN v_plan = 'free' THEN NULL ELSE p.plan_until END,
         CASE WHEN p.boost_until > now() THEN p.boost_until END,
         CASE WHEN p.boost_until > now() THEN p.boost_kind END,
         coalesce(c.priority, 0), coalesce(c.super, 0), coalesce(c.vip, 0), coalesce(c.boosts, 0),
         (SELECT count(*)::int FROM proposals pr WHERE pr.sender_id = auth.uid() AND pr.parent_id IS NULL AND pr.created_at > now() - interval '24 hours'),
         proposal_daily_limit(v_plan)
  FROM profiles p LEFT JOIN member_credits c ON c.user_id = p.id
  WHERE p.id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION proposals_membership_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF NEW.parent_id IS NOT NULL THEN
    NEW.tier := 'normal';
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('proposal_send:' || NEW.sender_id::text));
  v_limit := proposal_daily_limit(effective_plan(NEW.sender_id));
  IF v_limit IS NOT NULL AND (
    SELECT count(*) FROM proposals WHERE sender_id = NEW.sender_id AND parent_id IS NULL AND created_at > now() - interval '24 hours'
  ) >= v_limit THEN
    RAISE EXCEPTION 'DAILY_LIMIT';
  END IF;

  IF NEW.tier = 'priority' THEN
    UPDATE member_credits SET priority = priority - 1, updated_at = now() WHERE user_id = NEW.sender_id AND priority > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_CREDIT'; END IF;
  ELSIF NEW.tier = 'super' THEN
    UPDATE member_credits SET super = super - 1, updated_at = now() WHERE user_id = NEW.sender_id AND super > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_CREDIT'; END IF;
  ELSIF NEW.tier = 'vip' THEN
    UPDATE member_credits SET vip = vip - 1, updated_at = now() WHERE user_id = NEW.sender_id AND vip > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'NO_CREDIT'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_membership_trg ON proposals;
CREATE TRIGGER proposals_membership_trg BEFORE INSERT ON proposals
FOR EACH ROW EXECUTE FUNCTION proposals_membership_guard();

REVOKE EXECUTE ON FUNCTION effective_plan(uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION next_night_end() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apply_boost(uuid, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION fulfill_purchase(text, text, text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION apply_subscription(text, text, text, text, bigint, bigint) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION proposals_membership_guard() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION activate_boost() FROM public, anon;
REVOKE EXECUTE ON FUNCTION get_my_membership() FROM public, anon;
GRANT EXECUTE ON FUNCTION fulfill_purchase(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION apply_subscription(text, text, text, text, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION activate_boost() TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_membership() TO authenticated;
