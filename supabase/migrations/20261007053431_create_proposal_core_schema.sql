/*
# PROPOSAL core schema

Plain-English: Creates everything the PROPOSAL dating app needs: member profiles, a catalog of
date experiences, proposals (direct, open and counter-proposals), applications to open proposals,
chat messages for accepted proposals, a personal "Date Wallet", temporary stories and private
after-date feedback.

1. New Tables
- `profiles` - one per member (id = auth user). display_name, age (18+), city, bio, photo_url,
  interests (text[]), free_tonight_until + tonight_category (for the Tonight feature),
  verified (set by staff only), created_at.
- `experiences` - public catalog of date ideas: title, category, venue, city, description,
  image_url, default_time, price_hint, level, tags.
- `proposals` - an invitation to a specific plan. sender_id, recipient_id (NULL = open proposal),
  experience_id, title, category, level (casual/date/special), proposed_for, location, message,
  boost_amount + boost_perk (experience upgrade), status, parent_id (counter-proposal chain),
  expires_at (24/48h), reservation_status, cancelled_by, cancelled_after_accept, responded_at.
- `proposal_applications` - people applying to join an open proposal.
- `messages` - chat between the two people of an accepted proposal.
- `wallet_items` - experiences a member saved.
- `stories` - short 24h posts like "Free tonight".
- `feedback` - private after-date feedback; only the author can read it.

2. Security
- RLS enabled on every table.
- Profiles readable by signed-in members (dating profiles are meant to be seen); members can only
  create/edit their own. `verified` is not client-writable (column grants).
- Experiences are a read-only catalog.
- Proposals: visible to sender, recipient, or anyone when it is an open proposal. Inserts are
  owner-scoped; status changes happen only through secure functions (next migration), so there is
  no UPDATE/DELETE policy and UPDATE is revoked.
- Applications visible to the applicant and the proposal owner.
- Messages only for participants of an accepted proposal.
- Wallet items and stories owner-scoped; stories readable by members while not expired.
- Feedback readable only by its author; insert only by a participant about the other participant.

3. Important notes
1. A trigger on proposals forces sender, status and validates expiry (max 48h) and dates.
2. Payments for experience upgrades are not processed here; the amount is recorded only.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  age int NOT NULL CHECK (age BETWEEN 18 AND 99),
  city text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 400),
  photo_url text NOT NULL DEFAULT '',
  interests text[] NOT NULL DEFAULT '{}',
  free_tonight_until timestamptz,
  tonight_category text,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  venue text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  image_url text NOT NULL DEFAULT '',
  default_time text NOT NULL DEFAULT '',
  price_hint text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT 'date' CHECK (level IN ('casual','date','special')),
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  experience_id uuid REFERENCES experiences(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  category text NOT NULL DEFAULT 'food',
  level text NOT NULL DEFAULT 'date' CHECK (level IN ('casual','date','special')),
  proposed_for timestamptz NOT NULL,
  location text NOT NULL DEFAULT '' CHECK (char_length(location) <= 120),
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 500),
  boost_amount int NOT NULL DEFAULT 0 CHECK (boost_amount IN (0,25,50,100)),
  boost_perk text CHECK (boost_perk IS NULL OR boost_perk IN ('dinner_credit','flowers','vip_seats','ride_credit','dessert')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','open','accepted','declined','countered','cancelled','closed')),
  parent_id uuid REFERENCES proposals(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  reservation_status text NOT NULL DEFAULT 'none' CHECK (reservation_status IN ('none','booked')),
  cancelled_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  cancelled_after_accept boolean NOT NULL DEFAULT false,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_id IS NULL OR recipient_id <> sender_id)
);

CREATE INDEX IF NOT EXISTS proposals_sender_idx ON proposals(sender_id);
CREATE INDEX IF NOT EXISTS proposals_recipient_idx ON proposals(recipient_id);
CREATE INDEX IF NOT EXISTS proposals_open_idx ON proposals(status) WHERE recipient_id IS NULL;

CREATE TABLE IF NOT EXISTS proposal_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  applicant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '' CHECK (char_length(message) <= 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','chosen','not_chosen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, applicant_id)
);
CREATE INDEX IF NOT EXISTS applications_proposal_idx ON proposal_applications(proposal_id);
CREATE INDEX IF NOT EXISTS applications_applicant_idx ON proposal_applications(applicant_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_proposal_idx ON messages(proposal_id, created_at);

CREATE TABLE IF NOT EXISTS wallet_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  experience_id uuid NOT NULL REFERENCES experiences(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, experience_id)
);

CREATE TABLE IF NOT EXISTS stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 120),
  category text NOT NULL DEFAULT 'food',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stories_expires_idx ON stories(expires_at);

CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  met boolean NOT NULL,
  see_again boolean,
  matched_profile boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, author_id)
);
CREATE INDEX IF NOT EXISTS feedback_subject_idx ON feedback(subject_id);

-- Proposal insert guard
CREATE OR REPLACE FUNCTION proposals_before_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.parent_id IS NULL THEN
    NEW.sender_id := auth.uid();
    NEW.status := CASE WHEN NEW.recipient_id IS NULL THEN 'open' ELSE 'pending' END;
    NEW.reservation_status := 'none';
    NEW.cancelled_by := NULL;
    NEW.cancelled_after_accept := false;
    NEW.responded_at := NULL;
  END IF;
  IF NEW.expires_at < now() + interval '30 minutes' OR NEW.expires_at > now() + interval '48 hours 5 minutes' THEN
    RAISE EXCEPTION 'Invalid expiry';
  END IF;
  IF NEW.proposed_for < now() - interval '1 hour' THEN
    RAISE EXCEPTION 'Proposal date is in the past';
  END IF;
  IF (NEW.boost_amount = 0) <> (NEW.boost_perk IS NULL) THEN
    RAISE EXCEPTION 'Invalid upgrade';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_before_insert_trg ON proposals;
CREATE TRIGGER proposals_before_insert_trg BEFORE INSERT ON proposals
FOR EACH ROW EXECUTE FUNCTION proposals_before_insert();

-- RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "Members can view profiles" ON profiles;
CREATE POLICY "Members can view profiles" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Members create own profile" ON profiles;
CREATE POLICY "Members create own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Members update own profile" ON profiles;
CREATE POLICY "Members update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Members delete own profile" ON profiles;
CREATE POLICY "Members delete own profile" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

REVOKE INSERT, UPDATE ON profiles FROM anon, authenticated;
GRANT INSERT (display_name, age, city, bio, photo_url, interests, free_tonight_until, tonight_category) ON profiles TO authenticated;
GRANT UPDATE (display_name, age, city, bio, photo_url, interests, free_tonight_until, tonight_category) ON profiles TO authenticated;

-- experiences (read-only catalog)
DROP POLICY IF EXISTS "Members can view experiences" ON experiences;
CREATE POLICY "Members can view experiences" ON experiences FOR SELECT TO authenticated USING (true);

-- proposals
DROP POLICY IF EXISTS "Participants or open proposals visible" ON proposals;
CREATE POLICY "Participants or open proposals visible" ON proposals FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR recipient_id = auth.uid() OR (recipient_id IS NULL AND status = 'open'));
DROP POLICY IF EXISTS "Members send own proposals" ON proposals;
CREATE POLICY "Members send own proposals" ON proposals FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON proposals FROM anon, authenticated;
GRANT INSERT (recipient_id, experience_id, title, category, level, proposed_for, location, message, boost_amount, boost_perk, expires_at) ON proposals TO authenticated;

-- applications
DROP POLICY IF EXISTS "Applicant or owner can view applications" ON proposal_applications;
CREATE POLICY "Applicant or owner can view applications" ON proposal_applications FOR SELECT TO authenticated
USING (applicant_id = auth.uid() OR EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.sender_id = auth.uid()));
DROP POLICY IF EXISTS "Members apply to open proposals" ON proposal_applications;
CREATE POLICY "Members apply to open proposals" ON proposal_applications FOR INSERT TO authenticated
WITH CHECK (
  applicant_id = auth.uid()
  AND EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.status = 'open'
              AND p.recipient_id IS NULL AND p.sender_id <> auth.uid() AND p.expires_at > now())
);
DROP POLICY IF EXISTS "Applicants withdraw own applications" ON proposal_applications;
CREATE POLICY "Applicants withdraw own applications" ON proposal_applications FOR DELETE TO authenticated
USING (applicant_id = auth.uid() AND status = 'pending');

REVOKE INSERT, UPDATE ON proposal_applications FROM anon, authenticated;
GRANT INSERT (proposal_id, message) ON proposal_applications TO authenticated;

-- messages
DROP POLICY IF EXISTS "Participants read messages" ON messages;
CREATE POLICY "Participants read messages" ON messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND (p.sender_id = auth.uid() OR p.recipient_id = auth.uid())));
DROP POLICY IF EXISTS "Participants send messages" ON messages;
CREATE POLICY "Participants send messages" ON messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.status = 'accepted'
              AND (p.sender_id = auth.uid() OR p.recipient_id = auth.uid()))
);
REVOKE INSERT, UPDATE ON messages FROM anon, authenticated;
GRANT INSERT (proposal_id, body) ON messages TO authenticated;

-- wallet
DROP POLICY IF EXISTS "Own wallet select" ON wallet_items;
CREATE POLICY "Own wallet select" ON wallet_items FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Own wallet insert" ON wallet_items;
CREATE POLICY "Own wallet insert" ON wallet_items FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own wallet update" ON wallet_items;
CREATE POLICY "Own wallet update" ON wallet_items FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Own wallet delete" ON wallet_items;
CREATE POLICY "Own wallet delete" ON wallet_items FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE ON wallet_items FROM anon, authenticated;
GRANT INSERT (experience_id, note) ON wallet_items TO authenticated;
GRANT UPDATE (note) ON wallet_items TO authenticated;

-- stories
DROP POLICY IF EXISTS "Members view live stories" ON stories;
CREATE POLICY "Members view live stories" ON stories FOR SELECT TO authenticated USING (expires_at > now() OR user_id = auth.uid());
DROP POLICY IF EXISTS "Members post own stories" ON stories;
CREATE POLICY "Members post own stories" ON stories FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Members edit own stories" ON stories;
CREATE POLICY "Members edit own stories" ON stories FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Members delete own stories" ON stories;
CREATE POLICY "Members delete own stories" ON stories FOR DELETE TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE ON stories FROM anon, authenticated;
GRANT INSERT (body, category) ON stories TO authenticated;
GRANT UPDATE (body, category) ON stories TO authenticated;

-- feedback (private, immutable)
DROP POLICY IF EXISTS "Authors read own feedback" ON feedback;
CREATE POLICY "Authors read own feedback" ON feedback FOR SELECT TO authenticated USING (author_id = auth.uid());
DROP POLICY IF EXISTS "Participants leave feedback" ON feedback;
CREATE POLICY "Participants leave feedback" ON feedback FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.status = 'accepted' AND p.proposed_for < now()
    AND ((p.sender_id = auth.uid() AND p.recipient_id = subject_id) OR (p.recipient_id = auth.uid() AND p.sender_id = subject_id))
  )
);
REVOKE INSERT, UPDATE ON feedback FROM anon, authenticated;
GRANT INSERT (proposal_id, subject_id, met, see_again, matched_profile) ON feedback TO authenticated;
