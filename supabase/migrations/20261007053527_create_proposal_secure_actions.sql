/*
# PROPOSAL secure actions

Plain-English: All changes to a proposal's status go through these functions, which check that
the person asking is allowed to make that change. Also adds the Reliability Score calculation.

1. New Functions
- `respond_proposal(p_id, p_action)` - recipient accepts or declines a pending, unexpired proposal.
- `counter_proposal(p_id, p_title, p_proposed_for, p_location, p_message)` - recipient suggests a
  different plan/time; creates a new proposal back to the sender and marks the original "countered".
- `cancel_proposal(p_id)` - sender cancels a pending/open proposal, or either participant
  cancels an accepted one (counted against reliability).
- `choose_applicant(p_application_id)` - owner of an open proposal picks one applicant.
- `mark_booked(p_id)` - either participant marks an accepted plan as booked.
- `get_reliability(p_user)` - returns attended dates, no-shows, late cancellations, verified flag
  and a 0-100 score. Only aggregate numbers are exposed, never individual feedback.

2. Security
- All functions are SECURITY DEFINER with a fixed search_path, derive the caller from auth.uid(),
  and are executable by signed-in members only (revoked from anon/public).
*/

CREATE OR REPLACE FUNCTION respond_proposal(p_id uuid, p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_action NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid action'; END IF;
  UPDATE proposals
     SET status = CASE WHEN p_action = 'accept' THEN 'accepted' ELSE 'declined' END,
         responded_at = now()
   WHERE id = p_id AND recipient_id = auth.uid() AND status = 'pending' AND expires_at > now()
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION counter_proposal(p_id uuid, p_title text, p_proposed_for timestamptz, p_location text, p_message text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_orig proposals%ROWTYPE; v_new uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION cancel_proposal(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE proposals
     SET status = 'cancelled', cancelled_by = auth.uid(), cancelled_after_accept = (status = 'accepted')
   WHERE id = p_id
     AND ((sender_id = auth.uid() AND status IN ('pending','open'))
       OR ((sender_id = auth.uid() OR recipient_id = auth.uid()) AND status = 'accepted' AND proposed_for > now()))
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;
  UPDATE proposal_applications SET status = 'not_chosen' WHERE proposal_id = p_id AND status = 'pending';
END;
$$;

CREATE OR REPLACE FUNCTION choose_applicant(p_application_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_app proposal_applications%ROWTYPE; v_pid uuid;
BEGIN
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

CREATE OR REPLACE FUNCTION mark_booked(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE proposals SET reservation_status = 'booked'
   WHERE id = p_id AND status = 'accepted' AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Proposal not available'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION get_reliability(p_user uuid)
RETURNS TABLE (attended int, no_shows int, late_cancellations int, verified boolean, score int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE a int; n int; c int; v boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT count(*) FILTER (WHERE met), count(*) FILTER (WHERE NOT met) INTO a, n FROM feedback WHERE subject_id = p_user;
  SELECT count(*) INTO c FROM proposals WHERE cancelled_by = p_user AND cancelled_after_accept;
  SELECT pr.verified INTO v FROM profiles pr WHERE pr.id = p_user;
  RETURN QUERY SELECT a, n, c, coalesce(v, false),
    greatest(0, least(100, 70 + a * 5 - n * 15 - c * 8 + CASE WHEN coalesce(v, false) THEN 10 ELSE 0 END));
END;
$$;

REVOKE EXECUTE ON FUNCTION respond_proposal(uuid, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION counter_proposal(uuid, text, timestamptz, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION cancel_proposal(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION choose_applicant(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION mark_booked(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION get_reliability(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION proposals_before_insert() FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION respond_proposal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION counter_proposal(uuid, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION choose_applicant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_booked(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_reliability(uuid) TO authenticated;
