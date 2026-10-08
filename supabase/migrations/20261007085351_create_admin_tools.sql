/*
# Admin tools

Plain-English: Adds a protected list of administrators and a set of secure admin-only actions
so staff can see app statistics, browse members, verify or un-verify members, review and cancel
proposals, and add or remove other admins. The first admin is alkhutabiahmed@gmail.com.

1. New Tables
- `admins`
  - `user_id` (uuid, primary key, references the account)
  - `created_at` (timestamp)

2. New Functions (all check that the caller is an admin)
- `is_admin()` - true when the signed-in member is an admin.
- `admin_overview()` - headline numbers (members, verified, proposals by status, messages, etc.).
- `admin_members(p_search)` - member list with email and activity counts.
- `admin_set_verified(p_user, p_verified)` - verify / un-verify a member.
- `admin_proposals(p_status)` - latest proposals with sender/recipient names.
- `admin_cancel_proposal(p_id)` - cancel a live proposal (no reliability penalty to either member).
- `admin_list_admins()` / `admin_set_admin(p_email, p_grant)` - manage admins.

3. Security
- RLS enabled on `admins`; members can only see their own admin row (used to check access).
- No insert/update/delete rights on `admins` for app users; it changes only through
  `admin_set_admin`, which requires the caller to already be an admin.
- Admin functions are SECURITY DEFINER with a fixed search_path, check `is_admin()` using the
  caller's session (auth.uid()), and are not callable by signed-out visitors.

4. Important notes
1. An admin cannot remove their own admin access (prevents locking everyone out).
2. Member emails are only returned to admins.
*/

CREATE TABLE IF NOT EXISTS admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see own admin row" ON admins;
CREATE POLICY "Members see own admin row" ON admins FOR SELECT TO authenticated USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON admins FROM anon, authenticated;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION admin_overview()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE result json;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT json_build_object(
    'members', (SELECT count(*) FROM profiles),
    'verified', (SELECT count(*) FROM profiles WHERE verified),
    'new_this_week', (SELECT count(*) FROM profiles WHERE created_at > now() - interval '7 days'),
    'free_tonight', (SELECT count(*) FROM profiles WHERE free_tonight_until > now()),
    'proposals', (SELECT count(*) FROM proposals),
    'pending', (SELECT count(*) FROM proposals WHERE status = 'pending' AND expires_at > now()),
    'open', (SELECT count(*) FROM proposals WHERE status = 'open' AND expires_at > now()),
    'accepted', (SELECT count(*) FROM proposals WHERE status = 'accepted'),
    'declined', (SELECT count(*) FROM proposals WHERE status = 'declined'),
    'cancelled', (SELECT count(*) FROM proposals WHERE status = 'cancelled'),
    'messages', (SELECT count(*) FROM messages),
    'no_shows', (SELECT count(*) FROM feedback WHERE met = false)
  ) INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION admin_members(p_search text DEFAULT '')
RETURNS TABLE (
  id uuid, display_name text, email text, age int, city text, photo_url text,
  verified boolean, is_admin boolean, created_at timestamptz,
  sent int, received int, accepted int, no_shows int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q text := '%' || lower(coalesce(trim(p_search), '')) || '%';
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT p.id, p.display_name, u.email::text, p.age, p.city, p.photo_url, p.verified,
         EXISTS (SELECT 1 FROM admins a WHERE a.user_id = p.id),
         p.created_at,
         (SELECT count(*)::int FROM proposals x WHERE x.sender_id = p.id),
         (SELECT count(*)::int FROM proposals x WHERE x.recipient_id = p.id),
         (SELECT count(*)::int FROM proposals x WHERE x.status = 'accepted' AND (x.sender_id = p.id OR x.recipient_id = p.id)),
         (SELECT count(*)::int FROM feedback f WHERE f.subject_id = p.id AND f.met = false)
  FROM profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(p.display_name) LIKE q OR lower(u.email) LIKE q OR lower(p.city) LIKE q
  ORDER BY p.created_at DESC
  LIMIT 300;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_verified(p_user uuid, p_verified boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE profiles SET verified = coalesce(p_verified, false) WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_proposals(p_status text DEFAULT 'all')
RETURNS TABLE (
  id uuid, title text, level text, status text, proposed_for timestamptz, expires_at timestamptz,
  created_at timestamptz, boost_amount int, location text, sender_name text, recipient_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT x.id, x.title, x.level, x.status, x.proposed_for, x.expires_at, x.created_at,
         x.boost_amount, x.location, s.display_name, r.display_name
  FROM proposals x
  JOIN profiles s ON s.id = x.sender_id
  LEFT JOIN profiles r ON r.id = x.recipient_id
  WHERE coalesce(p_status, 'all') = 'all' OR x.status = p_status
  ORDER BY x.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION admin_cancel_proposal(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE proposals
  SET status = 'cancelled', cancelled_by = NULL, cancelled_after_accept = false, responded_at = now()
  WHERE id = p_id AND status IN ('pending','open','accepted','countered');
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal cannot be cancelled'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION admin_list_admins()
RETURNS TABLE (user_id uuid, email text, display_name text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  RETURN QUERY
  SELECT a.user_id, u.email::text, p.display_name, a.created_at
  FROM admins a
  JOIN auth.users u ON u.id = a.user_id
  LEFT JOIN profiles p ON p.id = a.user_id
  ORDER BY a.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION admin_set_admin(p_email text, p_grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user uuid;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT u.id INTO v_user FROM auth.users u WHERE lower(u.email) = lower(trim(p_email));
  IF v_user IS NULL THEN RAISE EXCEPTION 'No account with that email'; END IF;
  IF p_grant THEN
    INSERT INTO admins (user_id) VALUES (v_user) ON CONFLICT DO NOTHING;
  ELSE
    IF v_user = auth.uid() THEN RAISE EXCEPTION 'You cannot remove yourself'; END IF;
    DELETE FROM admins WHERE user_id = v_user;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION is_admin() FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_overview() FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_members(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_set_verified(uuid, boolean) FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_proposals(text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_cancel_proposal(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_list_admins() FROM public, anon;
REVOKE EXECUTE ON FUNCTION admin_set_admin(text, boolean) FROM public, anon;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_members(text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_verified(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_proposals(text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_cancel_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_list_admins() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_admin(text, boolean) TO authenticated;

INSERT INTO admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'alkhutabiahmed@gmail.com'
ON CONFLICT DO NOTHING;
