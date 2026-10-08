/*
# Admins get full access to every member feature

1. Plain English
- Admins are treated as having the top plan (BLACK) without paying.
- Admins can send Priority, Super and VIP proposals and use Tonight Boosts without spending credits.
- Paid exclusive proposals to celebrity VIPs still require payment (they pay real people).

2. Functions changed
- `effective_plan(p_user)`: returns 'black' for admins.
- `proposals_membership_guard()`: no credit deduction for admin senders.
- `activate_boost()`: admins can boost without using a credit.
- `get_my_membership()`: adds `admin_access` and reports unlimited (99) credits for admins.
  Dropped and recreated because its return columns change; no data is affected.

3. Security
- Admin status comes only from the `admins` table, which app users cannot modify.
*/

CREATE OR REPLACE FUNCTION public.effective_plan(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM admins WHERE user_id = p_user) THEN 'black'
  ELSE coalesce((SELECT CASE WHEN plan_until > now() THEN plan ELSE 'free' END FROM profiles WHERE id = p_user), 'free')
END;
$$;

CREATE OR REPLACE FUNCTION public.proposals_membership_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_limit int;
BEGIN
IF auth.uid() IS NULL THEN RETURN NEW; END IF;
IF effective_plan(NEW.sender_id) = 'free' THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
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

IF EXISTS (SELECT 1 FROM admins WHERE user_id = NEW.sender_id) THEN RETURN NEW; END IF;

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

CREATE OR REPLACE FUNCTION public.activate_boost()
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF NOT is_admin() THEN
UPDATE member_credits SET boosts = boosts - 1, updated_at = now() WHERE user_id = auth.uid() AND boosts > 0;
IF NOT FOUND THEN RAISE EXCEPTION 'NO_CREDIT'; END IF;
END IF;
RETURN apply_boost(auth.uid(), 'tonight');
END;
$$;
REVOKE ALL ON FUNCTION public.activate_boost() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_boost() TO authenticated;

DROP FUNCTION IF EXISTS public.get_my_membership();
CREATE FUNCTION public.get_my_membership()
RETURNS TABLE(plan text, plan_until timestamptz, boost_until timestamptz, boost_kind text, priority integer, super integer, vip integer, boosts integer, sent_today integer, daily_limit integer, admin_access boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_plan text; v_admin boolean;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
v_plan := effective_plan(auth.uid());
v_admin := is_admin();
RETURN QUERY
SELECT v_plan, CASE WHEN v_plan = 'free' OR v_admin THEN NULL ELSE p.plan_until END,
CASE WHEN p.boost_until > now() THEN p.boost_until END,
CASE WHEN p.boost_until > now() THEN p.boost_kind END,
CASE WHEN v_admin THEN 99 ELSE coalesce(c.priority, 0) END,
CASE WHEN v_admin THEN 99 ELSE coalesce(c.super, 0) END,
CASE WHEN v_admin THEN 99 ELSE coalesce(c.vip, 0) END,
CASE WHEN v_admin THEN 99 ELSE coalesce(c.boosts, 0) END,
(SELECT count(*)::int FROM proposals pr WHERE pr.sender_id = auth.uid() AND pr.parent_id IS NULL AND pr.created_at > now() - interval '24 hours'),
proposal_daily_limit(v_plan),
v_admin
FROM profiles p LEFT JOIN member_credits c ON c.user_id = p.id
WHERE p.id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_membership() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_membership() TO authenticated;
