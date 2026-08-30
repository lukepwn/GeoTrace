// Leaderboard Service for Geotrace
// Provides daily score tracking, player ranking, Supabase cloud persistence, and fallback community simulation.
import { getPlayerProfile, getTodayDateKey } from "./dailyGame";
import { supabase } from "./supabase";

const LEADERBOARD_HISTORY_KEY = "geotrace_leaderboard_history";

/**
 * Seeded PRNG for generating realistic daily community scores
 * @param {number} seed
 */
function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const COMMUNITY_CALLSIGNS = [
  "ApexRanger",
  "BeaconHunter",
  "VectorZero",
  "EchoTrace",
  "GridMaster",
  "Solaris-7",
  "NovaPulse",
  "CipherHawk",
  "Stratosphere",
  "ShadowPin",
  "AeroScout",
  "NorthStar",
  "DriftMarker",
  "Zenith-X",
  "GeoPhantom",
  "AtlasSeeker",
  "Orbital-4",
  "Vanguard-9",
  "SignalRunner",
  "Longitude-88",
];

const TIERS_BY_SCORE = (score) => {
  if (score >= 300) return "S";
  if (score >= 220) return "A";
  if (score >= 150) return "B";
  if (score >= 90) return "C";
  return "D";
};

/**
 * Generate simulated global daily scores for the community for a specific level
 * @param {string} dateKey
 * @param {string} levelId
 * @returns {Array<object>}
 */
function generateDailyCommunityScores(dateKey, levelId = "levelone") {
  const levelHash = (levelId || "levelone")
    .split("")
    .reduce((acc, c) => acc * 31 + c.charCodeAt(0), 13);
  const dateHash =
    dateKey
      .split("-")
      .reduce((acc, part) => acc * 31 + parseInt(part, 10), 42) + levelHash;

  const entries = [];
  COMMUNITY_CALLSIGNS.forEach((callsign, idx) => {
    const r1 = seededRandom(dateHash + idx * 7);
    const r2 = seededRandom(dateHash + idx * 13 + 1);
    const r3 = seededRandom(dateHash + idx * 19 + 2);

    // Realistic score spread: between 110 and 380
    const score = Math.round(110 + r1 * 270);
    // Guesses: 3 to 6
    const guessesCount = Math.floor(3 + r2 * 3.5);
    // Time in seconds: 25s to 240s
    const timeSeconds = Math.round(25 + r3 * 215);
    const tier = TIERS_BY_SCORE(score);

    entries.push({
      id: `comm-${idx}-${dateKey}-${levelId}`,
      userId: `comm-user-${idx}`,
      playerName: callsign,
      levelId,
      score,
      guessesCount,
      timeSeconds,
      tier,
      isCurrentUser: false,
      dateKey,
    });
  });

  return entries;
}

/**
 * Get all submitted scores from localStorage
 * @returns {Record<string, object>}
 */
function getLocalSubmissionHistory() {
  try {
    const raw = localStorage.getItem(LEADERBOARD_HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save user submission to localStorage history
 * @param {string} key
 * @param {object} entry
 */
function saveLocalSubmission(key, entry) {
  try {
    const history = getLocalSubmissionHistory();
    history[key] = entry;
    localStorage.setItem(LEADERBOARD_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error("Error saving leaderboard history:", err);
  }
}

/**
 * Fetch daily leaderboard for a given date and level from Supabase (with resilient fallback)
 * @param {string} [dateKey]
 * @param {string} [levelId]
 * @returns {Promise<{ leaderboard: Array<object>, userRank: number|null, userEntry: object|null, totalPlayers: number, isLive: boolean }>}
 */
export async function fetchDailyLeaderboard(
  dateKey = getTodayDateKey(),
  levelId = "levelone",
) {
  const profile = getPlayerProfile();
  const isRegistered = Boolean(profile.isRegistered);
  const localHistory = getLocalSubmissionHistory();
  const submissionKey = `${dateKey}_${levelId}`;
  const localUserSubmission =
    localHistory[submissionKey] ||
    (levelId === "levelone" ? localHistory[dateKey] : null) ||
    null;

  let liveEntries = [];
  let isLive = false;

  // 1. Try querying Supabase if available (contains verified registered scores)
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("leaderboard_entries")
        .select("*")
        .eq("date_key", dateKey)
        .eq("level_id", levelId)
        .order("score", { ascending: false })
        .order("guesses_count", { ascending: true })
        .order("time_seconds", { ascending: true })
        .limit(100);

      if (!error && Array.isArray(data)) {
        isLive = true;
        liveEntries = data.map((d) => ({
          id: d.id,
          userId: d.user_id,
          playerName: d.player_name,
          levelId: d.level_id,
          puzzleNumber: d.puzzle_number,
          dateKey: d.date_key,
          score: d.score,
          guessesCount: d.guesses_count,
          timeSeconds: d.time_seconds,
          tier: d.tier,
          gameState: d.game_state,
          submittedAt: d.submitted_at,
          isCurrentUser: isRegistered && d.user_id === profile.id,
          isRegistered: true,
        }));
      }
    } catch (err) {
      console.warn("Supabase leaderboard query notice:", err);
    }
  }

  let allEntries = [];

  if (liveEntries.length > 0) {
    allEntries = [...liveEntries];

    // Check if the current registered user is already present in liveEntries
    const userAlreadyInList = allEntries.some((e) => e.isCurrentUser);

    // If current user is not in top list but has a local submission (guest or outside top 100):
    if (!userAlreadyInList && localUserSubmission) {
      allEntries.push({
        ...localUserSubmission,
        playerName: profile.callsign,
        isCurrentUser: true,
        isRegistered,
      });
    }

    // If total real players is small (< 10), backfill with non-colliding simulated scores
    if (allEntries.length < 10) {
      const communityEntries = generateDailyCommunityScores(dateKey, levelId);
      const existingUserIds = new Set(allEntries.map((e) => e.userId));
      const backfill = communityEntries
        .filter((c) => !existingUserIds.has(c.userId))
        .slice(0, 10 - allEntries.length);
      allEntries.push(...backfill);
    }
  } else {
    // Fallback: simulated community entries + local user entry
    const communityEntries = generateDailyCommunityScores(dateKey, levelId);
    allEntries = [...communityEntries];

    if (localUserSubmission) {
      allEntries.push({
        ...localUserSubmission,
        playerName: profile.callsign,
        isCurrentUser: true,
        isRegistered,
      });
    }
  }

  // Sort: 1) Score descending, 2) Guesses ascending, 3) Time ascending
  allEntries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.guessesCount !== b.guessesCount)
      return a.guessesCount - b.guessesCount;
    return a.timeSeconds - b.timeSeconds;
  });

  // Assign ranks
  let userRank = null;
  let userEntry = null;

  const rankedList = allEntries.map((entry, index) => {
    const rank = index + 1;
    const isMe = Boolean(entry.isCurrentUser);
    const rankedEntry = {
      ...entry,
      rank,
      isCurrentUser: isMe,
      playerName: isMe ? profile.callsign : entry.playerName,
    };
    if (isMe) {
      userRank = rank;
      userEntry = rankedEntry;
    }
    return rankedEntry;
  });

  return {
    leaderboard: rankedList,
    userRank,
    userEntry,
    totalPlayers: rankedList.length,
    isLive,
  };
}

/**
 * Submit player score for today's daily puzzle on a specific level
 * @param {object} scorePayload
 * @param {string} scorePayload.dateKey
 * @param {string} [scorePayload.levelId]
 * @param {number} scorePayload.puzzleNumber
 * @param {number} scorePayload.score
 * @param {number} scorePayload.guessesCount
 * @param {number} scorePayload.timeSeconds
 * @param {string} scorePayload.tier
 * @param {string} scorePayload.gameState
 * @returns {Promise<{ success: boolean, rank: number }>}
 */
export async function submitDailyScore(scorePayload) {
  const profile = getPlayerProfile();
  const isRegistered = Boolean(profile.isRegistered);
  const {
    dateKey,
    levelId = "levelone",
    puzzleNumber,
    score,
    guessesCount,
    timeSeconds,
    tier,
    gameState,
  } = scorePayload;

  const entry = {
    id: `sub-${profile.id}-${dateKey}-${levelId}`,
    userId: profile.id,
    playerName: profile.callsign,
    levelId,
    puzzleNumber,
    dateKey,
    score,
    guessesCount,
    timeSeconds,
    tier,
    gameState,
    isCurrentUser: true,
    isRegistered,
    claimedByUserId: isRegistered ? profile.id : null,
    submittedAt: new Date().toISOString(),
  };

  // 1. Always save locally
  saveLocalSubmission(`${dateKey}_${levelId}`, entry);

  // 2. Upsert to Supabase ONLY if registered (guests are kept local)
  if (supabase && isRegistered) {
    try {
      await supabase.from("leaderboard_entries").upsert(
        {
          id: entry.id,
          user_id: profile.id,
          player_name: profile.callsign,
          level_id: entry.levelId,
          puzzle_number: entry.puzzleNumber,
          date_key: entry.dateKey,
          score: entry.score,
          guesses_count: entry.guessesCount,
          time_seconds: entry.timeSeconds,
          tier: entry.tier,
          game_state: entry.gameState,
          submitted_at: entry.submittedAt,
        },
        { onConflict: "user_id,date_key,level_id" },
      );
    } catch (err) {
      console.warn("Supabase score submission notice:", err);
    }
  }

  const result = await fetchDailyLeaderboard(dateKey, levelId);
  return {
    success: true,
    rank: result.userRank || 1,
    entry,
  };
}

/**
 * Format seconds into mm:ss
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
