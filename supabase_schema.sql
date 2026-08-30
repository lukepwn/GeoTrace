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
AS $$
BEGIN
  IF TRIM(requested_callsign) = '' THEN
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

-- 6. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Allow public read on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public insert on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow public update on profiles" ON public.profiles;

DROP POLICY IF EXISTS "Allow public read on leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Allow public insert on leaderboard_entries" ON public.leaderboard_entries;
DROP POLICY IF EXISTS "Allow public update on leaderboard_entries" ON public.leaderboard_entries;

-- Public read/write policies for seamless guest & authenticated play
CREATE POLICY "Allow public read on profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on profiles"
  ON public.profiles FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on profiles"
  ON public.profiles FOR UPDATE
  USING (true);

CREATE POLICY "Allow public read on leaderboard_entries"
  ON public.leaderboard_entries FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert on leaderboard_entries"
  ON public.leaderboard_entries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update on leaderboard_entries"
  ON public.leaderboard_entries FOR UPDATE
  USING (true);

-- 7. SAFE REALTIME BROADCASTING
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leaderboard_entries;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
