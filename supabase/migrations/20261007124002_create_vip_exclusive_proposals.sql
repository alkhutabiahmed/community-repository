/*
# VIP: verified public figures and Exclusive Proposals

1. New Tables
- `vip_profiles` - opt-in application from a member who is a public figure (creator, athlete, musician...).
  - user_id (pk, the member), role, followers, social_handle (for verification), city, intro,
    accepted_kinds (what they accept: dinner, concert, adventure, coffee, travel, surprise, custom),
    weekly_limit (how many proposals per week), price_standard / price_priority / price_premium (cents),
    availability_note, status (pending/approved/rejected, set only by admins), paused, created_at, approved_at.
- `vip_proposals` - a paid Exclusive Proposal from a member to a VIP.
  - sender_id, vip_id, kind, tier (standard/priority/premium), message, preferred_date,
    amount_cents, payout_cents (80% to the VIP), status (awaiting_payment/pending/accepted/declined/expired),
    paid_with (card/credit), reference (payment id, unique), paid_at, responded_at, expires_at (7 days to answer),
    proposal_id (the date created when accepted).

2. Modified Tables
- `member_credits.vip_credit_cents` - PROPOSAL credit returned when an Exclusive Proposal is declined or unanswered.
- `proposals.vip_proposal_id` - links an accepted Exclusive Proposal to a normal plan so both people can chat.

3. Security
- RLS on both tables. Only approved VIP profiles are visible to other members.
- Members can apply and edit their own content, but never their status, verification or follower count after applying.
- Nobody can write `vip_proposals` directly: creating, paying, answering and refunding all go through checked functions.
- Prices are always read from the VIP profile on the server; the weekly limit is checked under a lock.

4. Important notes
1. Paying buys the chance to submit a proposal, never a reply or a date.
2. Declined or unanswered proposals (after 7 days) are returned as PROPOSAL credit, usable for another Exclusive Proposal.
*/

CREATE TABLE IF NOT EXISTS vip_profiles (
user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
role text NOT NULL CHECK (char_length(role) BETWEEN 2 AND 40),
followers integer NOT NULL DEFAULT 0 CHECK (followers BETWEEN 0 AND 1000000000),
social_handle text NOT NULL CHECK (char_length(social_handle) BETWEEN 2 AND 60),
city text NOT NULL DEFAULT '' CHECK (char_length(city) <= 60),
intro text NOT NULL DEFAULT '' CHECK (char_length(intro) <= 400),
accepted_kinds text[] NOT NULL CHECK (cardinality(accepted_kinds) >= 1 AND accepted_kinds <@ ARRAY['dinner','concert','adventure','coffee','travel','surprise','custom']),
weekly_limit integer NOT NULL DEFAULT 10 CHECK (weekly_limit BETWEEN 1 AND 200),
price_standard integer NOT NULL CHECK (price_standard BETWEEN 1000 AND 100000),
price_priority integer CHECK (price_priority IS NULL OR price_priority BETWEEN 1000 AND 500000),
price_premium integer CHECK (price_premium IS NULL OR price_premium BETWEEN 1000 AND 1000000),
availability_note text NOT NULL DEFAULT '' CHECK (char_length(availability_note) <= 120),
status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
paused boolean NOT NULL DEFAULT false,
created_at timestamptz NOT NULL DEFAULT now(),
approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS vip_proposals (
id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
vip_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
kind text NOT NULL CHECK (kind IN ('dinner','concert','adventure','coffee','travel','surprise','custom')),
tier text NOT NULL DEFAULT 'standard' CHECK (tier IN ('standard','priority','premium')),
message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
preferred_date date,
amount_cents integer NOT NULL CHECK (amount_cents > 0),
payout_cents integer NOT NULL CHECK (payout_cents >= 0),
status text NOT NULL DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment','pending','accepted','declined','expired')),
paid_with text CHECK (paid_with IS NULL OR paid_with IN ('card','credit')),
reference text UNIQUE,
created_at timestamptz NOT NULL DEFAULT now(),
paid_at timestamptz,
responded_at timestamptz,
expires_at timestamptz,
proposal_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
CHECK (sender_id <> vip_id)
);

CREATE INDEX IF NOT EXISTS vip_proposals_vip_idx ON vip_proposals (vip_id, status, paid_at);
CREATE INDEX IF NOT EXISTS vip_proposals_sender_idx ON vip_proposals (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vip_profiles_status_idx ON vip_profiles (status);

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='member_credits' AND column_name='vip_credit_cents') THEN
ALTER TABLE member_credits ADD COLUMN vip_credit_cents integer NOT NULL DEFAULT 0 CHECK (vip_credit_cents >= 0);
END IF;
IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='proposals' AND column_name='vip_proposal_id') THEN
ALTER TABLE proposals ADD COLUMN vip_proposal_id uuid REFERENCES vip_proposals(id) ON DELETE SET NULL;
END IF;
END $$;

ALTER TABLE vip_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vip_proposals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON vip_profiles FROM anon, authenticated;
GRANT SELECT ON vip_profiles TO authenticated;
GRANT INSERT (role, followers, social_handle, city, intro, accepted_kinds, weekly_limit, price_standard, price_priority, price_premium, availability_note) ON vip_profiles TO authenticated;
GRANT UPDATE (intro, accepted_kinds, weekly_limit, price_standard, price_priority, price_premium, availability_note, paused) ON vip_profiles TO authenticated;
GRANT DELETE ON vip_profiles TO authenticated;

REVOKE ALL ON vip_proposals FROM anon, authenticated;
GRANT SELECT ON vip_proposals TO authenticated;

DROP POLICY IF EXISTS "Approved VIPs are visible" ON vip_profiles;
CREATE POLICY "Approved VIPs are visible" ON vip_profiles FOR SELECT TO authenticated
USING ((status = 'approved' AND NOT paused) OR user_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "Members apply as VIP" ON vip_profiles;
CREATE POLICY "Members apply as VIP" ON vip_profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "VIPs edit own profile" ON vip_profiles;
CREATE POLICY "VIPs edit own profile" ON vip_profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Withdraw own unapproved application" ON vip_profiles;
CREATE POLICY "Withdraw own unapproved application" ON vip_profiles FOR DELETE TO authenticated
USING (user_id = auth.uid() AND status <> 'approved');

DROP POLICY IF EXISTS "Sender or VIP see exclusive proposals" ON vip_proposals;
CREATE POLICY "Sender or VIP see exclusive proposals" ON vip_proposals FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR (vip_id = auth.uid() AND status <> 'awaiting_payment'));

CREATE OR REPLACE FUNCTION public.vip_week_used(p_vip uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
SELECT count(*)::int FROM vip_proposals
WHERE vip_id = p_vip AND (
(status <> 'awaiting_payment' AND paid_at >= date_trunc('week', now()))
OR (status = 'awaiting_payment' AND created_at > now() - interval '30 minutes')
);
$$;
REVOKE ALL ON FUNCTION public.vip_week_used(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_vip_slots()
RETURNS TABLE(vip_id uuid, used integer, weekly_limit integer) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
SELECT v.user_id, vip_week_used(v.user_id), v.weekly_limit FROM vip_profiles v
WHERE v.status = 'approved' AND auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.get_vip_slots() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_vip_slots() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_vip_proposal(p_vip uuid, p_kind text, p_tier text, p_message text, p_date date)
RETURNS TABLE(id uuid, paid boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v vip_profiles%ROWTYPE; v_amount int; v_id uuid; v_paid boolean := false;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_vip = auth.uid() THEN RAISE EXCEPTION 'NOT_AVAILABLE'; END IF;
IF p_date IS NOT NULL AND p_date < current_date THEN RAISE EXCEPTION 'BAD_DATE'; END IF;
PERFORM pg_advisory_xact_lock(hashtext('vip_slots:' || p_vip::text));

SELECT * INTO v FROM vip_profiles WHERE user_id = p_vip AND status = 'approved' AND NOT paused;
IF v.user_id IS NULL OR NOT (p_kind = ANY (v.accepted_kinds)) THEN RAISE EXCEPTION 'NOT_AVAILABLE'; END IF;
v_amount := CASE p_tier WHEN 'standard' THEN v.price_standard WHEN 'priority' THEN v.price_priority WHEN 'premium' THEN v.price_premium END;
IF v_amount IS NULL THEN RAISE EXCEPTION 'NOT_AVAILABLE'; END IF;
IF vip_week_used(p_vip) >= v.weekly_limit THEN RAISE EXCEPTION 'WEEK_FULL'; END IF;

UPDATE member_credits SET vip_credit_cents = vip_credit_cents - v_amount, updated_at = now()
WHERE user_id = auth.uid() AND vip_credit_cents >= v_amount;
v_paid := FOUND;

INSERT INTO vip_proposals (sender_id, vip_id, kind, tier, message, preferred_date, amount_cents, payout_cents,
status, paid_with, paid_at, expires_at)
VALUES (auth.uid(), p_vip, p_kind, p_tier, left(coalesce(p_message, ''), 500), p_date, v_amount, (v_amount * 80) / 100,
CASE WHEN v_paid THEN 'pending' ELSE 'awaiting_payment' END,
CASE WHEN v_paid THEN 'credit' END,
CASE WHEN v_paid THEN now() END,
CASE WHEN v_paid THEN now() + interval '7 days' END)
RETURNING vip_proposals.id INTO v_id;
RETURN QUERY SELECT v_id, v_paid;
END;
$$;
REVOKE ALL ON FUNCTION public.create_vip_proposal(uuid, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_vip_proposal(uuid, text, text, text, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.fulfill_vip_proposal(p_customer text, p_id uuid, p_reference text, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
SELECT user_id INTO v_user FROM stripe_customers WHERE customer_id = p_customer AND deleted_at IS NULL;
IF v_user IS NULL THEN RAISE EXCEPTION 'Unknown customer'; END IF;
IF EXISTS (SELECT 1 FROM vip_proposals WHERE reference = p_reference) THEN RETURN; END IF;
UPDATE vip_proposals SET status = 'pending', paid_with = 'card', reference = p_reference,
paid_at = now(), expires_at = now() + interval '7 days'
WHERE id = p_id AND sender_id = v_user AND status = 'awaiting_payment' AND amount_cents <= p_amount;
IF NOT FOUND THEN
INSERT INTO member_credits (user_id, vip_credit_cents) VALUES (v_user, p_amount)
ON CONFLICT (user_id) DO UPDATE SET vip_credit_cents = member_credits.vip_credit_cents + p_amount, updated_at = now();
END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fulfill_vip_proposal(text, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fulfill_vip_proposal(text, uuid, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.vip_kind_category(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT CASE p_kind WHEN 'dinner' THEN 'food' WHEN 'concert' THEN 'music' WHEN 'adventure' THEN 'active'
WHEN 'coffee' THEN 'coffee' WHEN 'travel' THEN 'travel' ELSE 'culture' END; $$;

CREATE OR REPLACE FUNCTION public.respond_vip_proposal(p_id uuid, p_action text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r vip_proposals%ROWTYPE; v_city text; v_pid uuid;
BEGIN
IF p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;
UPDATE vip_proposals SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END, responded_at = now()
WHERE vip_proposals.id = p_id AND vip_id = auth.uid() AND status = 'pending' AND expires_at > now()
RETURNING * INTO r;
IF r.id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;

IF p_action = 'decline' THEN
INSERT INTO member_credits (user_id, vip_credit_cents) VALUES (r.sender_id, r.amount_cents)
ON CONFLICT (user_id) DO UPDATE SET vip_credit_cents = member_credits.vip_credit_cents + r.amount_cents, updated_at = now();
RETURN NULL;
END IF;

SELECT city INTO v_city FROM vip_profiles WHERE user_id = r.vip_id;
INSERT INTO proposals (sender_id, recipient_id, title, category, level, proposed_for, location, message,
status, expires_at, responded_at, vip_proposal_id)
VALUES (r.sender_id, r.vip_id, 'Exclusive ' || r.kind, vip_kind_category(r.kind), 'special',
coalesce(r.preferred_date::timestamptz + interval '20 hours', now() + interval '7 days'),
left(coalesce(v_city, ''), 120), r.message, 'accepted', now() + interval '7 days', now(), r.id)
RETURNING proposals.id INTO v_pid;
UPDATE vip_proposals SET proposal_id = v_pid WHERE vip_proposals.id = r.id;
RETURN v_pid;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_vip_proposal(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_vip_proposal(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.refund_expired_vip_proposals()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_total int;
BEGIN
IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
WITH done AS (
UPDATE vip_proposals SET status = 'expired', responded_at = now()
WHERE sender_id = auth.uid() AND status = 'pending' AND expires_at <= now()
RETURNING amount_cents
)
SELECT coalesce(sum(amount_cents), 0)::int INTO v_total FROM done;
IF v_total > 0 THEN
INSERT INTO member_credits (user_id, vip_credit_cents) VALUES (auth.uid(), v_total)
ON CONFLICT (user_id) DO UPDATE SET vip_credit_cents = member_credits.vip_credit_cents + v_total, updated_at = now();
END IF;
RETURN v_total;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_expired_vip_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refund_expired_vip_proposals() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_vip_applications()
RETURNS TABLE(user_id uuid, display_name text, email text, role text, followers int, social_handle text, city text,
status text, weekly_limit int, price_standard int, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
RETURN QUERY
SELECT v.user_id, p.display_name, u.email::text, v.role, v.followers, v.social_handle, v.city,
v.status, v.weekly_limit, v.price_standard, v.created_at
FROM vip_profiles v JOIN profiles p ON p.id = v.user_id LEFT JOIN auth.users u ON u.id = v.user_id
ORDER BY (v.status = 'pending') DESC, v.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_vip_applications() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_vip_applications() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_vip_status(p_user uuid, p_status text, p_followers integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
IF p_status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;
UPDATE vip_profiles SET status = p_status,
followers = coalesce(p_followers, followers),
approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END
WHERE user_id = p_user;
IF NOT FOUND THEN RAISE EXCEPTION 'Not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_vip_status(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_vip_status(uuid, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.proposals_membership_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_limit int;
BEGIN
IF NEW.vip_proposal_id IS NOT NULL THEN RETURN NEW; END IF;
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