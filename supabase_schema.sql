-- ==============================================================================
-- Geotrace Supabase Schema, Authentication & Unique Callsigns Setup
-- Run this script in your Supabase Dashboard -> SQL Editor
-- (Idempotent & safe to re-run multiple times)
-- ==============================================================================

-- 1. PROFILES TABLE (Player Identity & Callsigns)
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  callsign TEXT NOT NULL,
  email TEXT,
  is_registered BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

-- Ensure columns exist if table was previously created
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_registered BOOLEAN DEFAULT FALSE NOT NULL;

-- 2. LEADERBOARD ENTRIES TABLE (Daily Game Scores & Submissions)
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  date_key TEXT NOT NULL,
  level_id TEXT NOT NULL DEFAULT 'levelone',
  puzzle_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  guesses_count INTEGER NOT NULL,
  time_seconds INTEGER NOT NULL,
  tier TEXT NOT NULL DEFAULT 'D',
  game_state TEXT NOT NULL DEFAULT 'WON',
  submitted_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL,
  CONSTRAINT unique_user_daily_level UNIQUE (user_id, date_key, level_id)
);

-- 3. UNIQUE CALLSIGN INDEX (Case-Insensitive)
-- Clean up any duplicate test rows if present before creating unique index
DELETE FROM public.profiles a USING public.profiles b
WHERE a.ctid < b.ctid AND LOWER(a.callsign) = LOWER(b.callsign);

-- Ensures no two operators can register or claim the same callsign
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_callsign_unique
  ON public.profiles (LOWER(callsign));

-- 4. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_leaderboard_daily_level
  ON public.leaderboard_entries (date_key, level_id, score DESC, guesses_count ASC, time_seconds ASC);

CREATE INDEX IF NOT EXISTS idx_leaderboard_user_id
  ON public.leaderboard_entries (user_id);

CREATE INDEX IF NOT EXISTS idx_profiles_updated
  ON public.profiles (updated_at DESC);

-- 5. FUNCTION: Check Callsign Availability (RPC)
CREATE OR REPLACE FUNCTION public.check_callsign_available(
  requested_callsign TEXT,
  requesting_user_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF requested_callsign IS NULL OR TRIM(requested_callsign) = '' THEN
    RETURN FALSE;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE LOWER(callsign) = LOWER(TRIM(requested_callsign))
      AND (requesting_user_id IS NULL OR id != requesting_user_id)
  );
END;
$$;

-- Grant execution permissions for RPC
GRANT EXECUTE ON FUNCTION public.check_callsign_available(TEXT, TEXT) TO anon, authenticated, service_role;

-- 5b. FUNCTION: Resolve Login Email by Exact Callsign (RPC)
-- Allows callsign-based login without exposing public.profiles to bulk SELECT queries
CREATE OR REPLACE FUNCTION public.resolve_login_email(
  requested_callsign TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  found_email TEXT;
BEGIN
  IF requested_callsign IS NULL OR TRIM(requested_callsign) = '' THEN
    RETURN NULL;
  END IF;

  SELECT email INTO found_email
  FROM public.profiles
  WHERE LOWER(callsign) = LOWER(TRIM(requested_callsign))
  LIMIT 1;

  RETURN found_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(TEXT) TO anon, authenticated, service_role;

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Drop legacy & current policies if re-running
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public insert on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "Allow public read on leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Allow public insert on leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Allow public update on leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Authenticated users can insert own leaderboard entry" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Authenticated users can update own leaderboard entry" ON public.leaderboard_entries;

-- Profiles: authenticated users can only read/write their own row
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid()::text = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = id)
  WITH CHECK (auth.uid()::text = id);

-- Leaderboard: public read, authenticated owner-only write with score bounds
CREATE POLICY "Allow public read on leaderboard_entries"
  ON public.leaderboard_entries FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert own leaderboard entry"
  ON public.leaderboard_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid()::text = user_id
    AND score >= 0 AND score <= 2000
    AND guesses_count BETWEEN 1 AND 6
    AND time_seconds >= 0
    AND tier IN ('S', 'A', 'B', 'C', 'D')
    AND game_state IN ('WON', 'LOST')
  );

CREATE POLICY "Authenticated users can update own leaderboard entry"
  ON public.leaderboard_entries FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id)
  WITH CHECK (
    auth.uid()::text = user_id
    AND score >= 0 AND score <= 2000
    AND guesses_count BETWEEN 1 AND 6
    AND time_seconds >= 0
    AND tier IN ('S', 'A', 'B', 'C', 'D')
    AND game_state IN ('WON', 'LOST')
  );

-- 7. SAFE REALTIME BROADCASTING
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_entries;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 8. PLAYER FEEDBACK & TRANSMISSION REPORTS
CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  callsign TEXT NOT NULL DEFAULT 'Guest',
  email TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  puzzle_number INTEGER,
  level_id TEXT,
  game_state TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::TEXT, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at
  ON public.feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_category
  ON public.feedback (category);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public insert on feedback" ON public.feedback;
DROP POLICY IF EXISTS "Allow public read on feedback" ON public.feedback;

-- Anyone can submit bounded feedback; user_id must be NULL (guest) or match auth.uid()
-- No SELECT policy is granted: only Supabase Dashboard / service_role can read feedback
CREATE POLICY "Allow public insert on feedback"
  ON public.feedback FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(message)) BETWEEN 1 AND 1500
    AND (user_id IS NULL OR user_id = auth.uid()::text)
  );
