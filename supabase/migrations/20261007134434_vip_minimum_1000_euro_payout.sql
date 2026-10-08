/*
# Guarantee VIPs at least EUR 1,000 per accepted proposal

1. Plain English
- Joining as a VIP stays free (no plan or fee needed to apply).
- Every exclusive proposal now pays the VIP at least EUR 1,000 when they accept it.
  VIPs keep 80%, so the lowest allowed standard price is EUR 1,250.

2. Modified tables
- `vip_profiles`: price limits changed
  - price_standard: EUR 1,250 - EUR 25,000 (was EUR 10 - EUR 1,000)
  - price_priority: EUR 1,250 - EUR 50,000
  - price_premium: EUR 1,250 - EUR 100,000
- `vip_proposals`: new check that payout_cents >= 100000 (EUR 1,000).

3. Functions
- `create_vip_proposal` stores payout as the greater of 80% of the price or EUR 1,000.

4. Notes
- No existing rows are affected (no VIP profiles existed when this was written).
- Security (RLS, grants) is unchanged.
*/

ALTER TABLE vip_profiles DROP CONSTRAINT IF EXISTS vip_profiles_price_standard_check;
ALTER TABLE vip_profiles ADD CONSTRAINT vip_profiles_price_standard_check CHECK (price_standard BETWEEN 125000 AND 2500000);
ALTER TABLE vip_profiles DROP CONSTRAINT IF EXISTS vip_profiles_price_priority_check;
ALTER TABLE vip_profiles ADD CONSTRAINT vip_profiles_price_priority_check CHECK (price_priority IS NULL OR price_priority BETWEEN 125000 AND 5000000);
ALTER TABLE vip_profiles DROP CONSTRAINT IF EXISTS vip_profiles_price_premium_check;
ALTER TABLE vip_profiles ADD CONSTRAINT vip_profiles_price_premium_check CHECK (price_premium IS NULL OR price_premium BETWEEN 125000 AND 10000000);

ALTER TABLE vip_proposals DROP CONSTRAINT IF EXISTS vip_proposals_min_payout_check;
ALTER TABLE vip_proposals ADD CONSTRAINT vip_proposals_min_payout_check CHECK (payout_cents >= 100000);

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
VALUES (auth.uid(), p_vip, p_kind, p_tier, left(coalesce(p_message, ''), 500), p_date, v_amount,
GREATEST(100000, (v_amount * 80) / 100),
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
