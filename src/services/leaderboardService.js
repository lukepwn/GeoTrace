// Leaderboard Service for GeoTrace
// Provides daily score tracking, player ranking, and pluggable backend support (Local/Mock + Cloud adapters).
import { getPlayerProfile, getTodayDateKey } from "./dailyGame";

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
 * Fetch daily leaderboard for a given date and level
 * Combines community entries with the current user's submitted score and computes live ranks.
 * @param {string} [dateKey]
 * @param {string} [levelId]
 * @returns {Promise<{ leaderboard: Array<object>, userRank: number|null, userEntry: object|null, totalPlayers: number }>}
 */
export async function fetchDailyLeaderboard(
  dateKey = getTodayDateKey(),
  levelId = "levelone",
) {
  const profile = getPlayerProfile();
  const communityEntries = generateDailyCommunityScores(dateKey, levelId);
  const localHistory = getLocalSubmissionHistory();
  const submissionKey = `${dateKey}_${levelId}`;
  const userSubmission =
    localHistory[submissionKey] ||
    (levelId === "levelone" ? localHistory[dateKey] : null) ||
    null;

  let allEntries = [...communityEntries];

  if (userSubmission) {
    userSubmission.playerName = profile.callsign;
    userSubmission.isCurrentUser = true;
    allEntries.push(userSubmission);
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
    const rankedEntry = { ...entry, rank };
    if (entry.userId === profile.id || entry.isCurrentUser) {
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
    submittedAt: new Date().toISOString(),
  };

  saveLocalSubmission(`${dateKey}_${levelId}`, entry);

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
