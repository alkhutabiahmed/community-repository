/*
# Make Exclusive Proposal payment confirmation idempotent

1. Changes
- `fulfill_vip_proposal` records each payment reference in `member_purchases` first, so a repeated
  payment notification can never confirm or credit the same payment twice.
- If the proposal can no longer be confirmed (already paid, or amount mismatch), the payment is kept as PROPOSAL credit.
*/

CREATE OR REPLACE FUNCTION public.fulfill_vip_proposal(p_customer text, p_id uuid, p_reference text, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid;
BEGIN
SELECT user_id INTO v_user FROM stripe_customers WHERE customer_id = p_customer AND deleted_at IS NULL;
IF v_user IS NULL THEN RAISE EXCEPTION 'Unknown customer'; END IF;

INSERT INTO member_purchases (user_id, product, reference) VALUES (v_user, 'vip_submission', p_reference)
ON CONFLICT (reference) DO NOTHING;
IF NOT FOUND THEN RETURN; END IF;

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