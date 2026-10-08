/*
# Require a paid plan to send and receive proposals

1. Changes
- Free members can no longer send proposals (direct, open plans or counter-proposals).
- Free members cannot read, accept, decline or counter proposals waiting for them; they only see how many are waiting.
- Free members cannot apply to open plans.
- Already accepted dates stay visible and usable for everyone involved.

2. New functions
- `i_am_paid()` - true when the signed-in member has an active paid plan.
- `get_locked_proposals()` - number of pending proposals waiting for a free member (no details).

3. Modified
- `proposal_daily_limit`: free plan now 0.
- `proposals_membership_guard`: raises PLAN_REQUIRED for free senders, including counter-proposals.
- `respond_proposal`, `counter_proposal`, `choose_applicant`: raise PLAN_REQUIRED for free members.
- Proposal SELECT policy: recipients only see pending proposals when on a paid plan.
- Applications INSERT policy: applicant must be on a paid plan.
*/

CREATE OR REPLACE FUNCTION public.i_am_paid()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT auth.uid() IS NOT NULL AND effective_plan(auth.uid()) <> 'free'; $$;
REVOKE ALL ON FUNCTION public.i_am_paid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_am_paid() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_locked_proposals()
RETURNS TABLE(total int, special int) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF i_am_paid() THEN RETURN QUERY SELECT 0, 0; RETURN; END IF;
RETURN QUERY
SELECT count(*)::int, count(*) FILTER (WHERE tier IN ('super','vip'))::int
FROM proposals WHERE recipient_id = auth.uid() AND status = 'pending' AND expires_at > now();
END;
$$;
REVOKE ALL ON FUNCTION public.get_locked_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_locked_proposals() TO authenticated;

CREATE OR REPLACE FUNCTION public.proposal_daily_limit(p_plan text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT CASE p_plan WHEN 'free' THEN 0 WHEN 'plus' THEN 20 ELSE NULL END; $$;

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

CREATE OR REPLACE FUNCTION public.respond_proposal(p_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
IF p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;
IF NOT i_am_paid() THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
UPDATE proposals
SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END,
responded_at = now()
WHERE id = p_id AND recipient_id = auth.uid() AND status = 'pending' AND expires_at > now()
RETURNING id INTO v_id;
IF v_id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.counter_proposal(p_id uuid, p_title text, p_proposed_for timestamptz, p_location text, p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_orig proposals%ROWTYPE; v_new uuid;
BEGIN
IF NOT i_am_paid() THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
UPDATE proposals SET status = 'countered', responded_at = now()
WHERE id = p_id AND recipient_id = auth.uid() AND status = 'pending' AND expires_at > now()
RETURNING * INTO v_orig;
IF v_orig.id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;
IF p_proposed_for < now() THEN RAISE EXCEPTION 'Date is in the past'; END IF;

INSERT INTO proposals (sender_id, recipient_id, experience_id, title, category, level, proposed_for,
location, message, boost_amount, boost_perk, status, parent_id, expires_at)
VALUES (auth.uid(), v_orig.sender_id, v_orig.experience_id,
left(coalesce(nullif(trim(p_title), ''), v_orig.title), 80), v_orig.category, v_orig.level,
p_proposed_for, left(coalesce(p_location, v_orig.location), 120), left(coalesce(p_message, ''), 500),
0, NULL, 'pending', v_orig.id, now() + interval '24 hours')
RETURNING id INTO v_new;
RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.choose_applicant(p_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_app proposal_applications%ROWTYPE; v_pid uuid;
BEGIN
IF NOT i_am_paid() THEN RAISE EXCEPTION 'PLAN_REQUIRED'; END IF;
SELECT * INTO v_app FROM proposal_applications WHERE id = p_application_id AND status = 'pending';
IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not available'; END IF;

UPDATE proposals SET recipient_id = v_app.applicant_id, status = 'accepted', responded_at = now()
WHERE id = v_app.proposal_id AND sender_id = auth.uid() AND status = 'open' AND recipient_id IS NULL
RETURNING id INTO v_pid;
IF v_pid IS NULL THEN RAISE EXCEPTION 'Application not available'; END IF;

UPDATE proposal_applications SET status = CASE WHEN id = v_app.id THEN 'chosen' ELSE 'not_chosen' END
WHERE proposal_id = v_pid;
RETURN v_pid;
END;
$$;

DROP POLICY IF EXISTS "Participants or open proposals visible" ON proposals;
CREATE POLICY "Participants or open proposals visible" ON proposals FOR SELECT
TO authenticated
USING (
sender_id = auth.uid()
OR (recipient_id = auth.uid() AND (status <> 'pending' OR i_am_paid()))
OR (recipient_id IS NULL AND status = 'open')
);

DROP POLICY IF EXISTS "Members apply to open proposals" ON proposal_applications;
CREATE POLICY "Members apply to open proposals" ON proposal_applications FOR INSERT
TO authenticated
WITH CHECK (
applicant_id = auth.uid() AND i_am_paid() AND EXISTS (
SELECT 1 FROM proposals p
WHERE p.id = proposal_applications.proposal_id AND p.status = 'open'
AND p.recipient_id IS NULL AND p.sender_id <> auth.uid() AND p.expires_at > now()
)
);