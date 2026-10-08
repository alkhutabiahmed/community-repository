/*
# One free proposal for every new member

1. What changes
- Members on the free plan may now send exactly ONE direct proposal (to a specific person), once per account, ever.
- After that first proposal, sending again requires a paid plan (same as before).
- Open proposals, counter-proposals, answering proposals and applying to open plans still require a paid plan.
- Paid members and admins are unaffected.

2. New functions
- `has_free_proposal()` - true when the signed-in member is on the free plan and has never sent a proposal.
- `free_proposal_available(uuid)` - internal helper used by the sending rule.

3. Modified
- `proposals_membership_guard`: free senders are allowed through once for a direct proposal; the daily limit does not apply to that one free proposal. Uses the existing per-sender lock so two quick sends cannot both count as "first".

4. Security notes
- The check is enforced in the database, not only in the app, so it cannot be bypassed from the browser.
- Members cannot delete proposals they have sent, so the free proposal cannot be "refunded" by deleting it.
*/

CREATE OR REPLACE FUNCTION public.free_proposal_available(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
SELECT effective_plan(p_user) = 'free'
AND NOT EXISTS (SELECT 1 FROM proposals WHERE sender_id = p_user AND parent_id IS NULL);
$$;
REVOKE ALL ON FUNCTION public.free_proposal_available(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.has_free_proposal()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND free_proposal_available(auth.uid()); $$;
REVOKE ALL ON FUNCTION public.has_free_proposal() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_free_proposal() TO authenticated;

CREATE OR REPLACE FUNCTION public.proposals_membership_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_limit int; v_free_trial boolean := false;
BEGIN
IF auth.uid() IS NULL THEN RETURN NEW; END IF;

IF effective_plan(NEW.sender_id) = 'free' THEN
  IF NEW.parent_id IS NOT NULL OR NEW.recipient_id IS NULL THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('proposal_send:' || NEW.sender_id::text));
  IF NOT free_proposal_available(NEW.sender_id) THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
  v_free_trial := true;
END IF;

IF NEW.parent_id IS NOT NULL THEN
  NEW.tier := 'normal';
  RETURN NEW;
END IF;

IF NOT v_free_trial THEN
  PERFORM pg_advisory_xact_lock(hashtext('proposal_send:' || NEW.sender_id::text));
  v_limit := proposal_daily_limit(effective_plan(NEW.sender_id));
  IF v_limit IS NOT NULL AND (
    SELECT count(*) FROM proposals WHERE sender_id = NEW.sender_id AND parent_id IS NULL AND created_at > now() - interval '24 hours'
  ) >= v_limit THEN
    RAISE EXCEPTION 'DAILY_LIMIT';
  END IF;
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