// Daily Game Service for Geotrace
// Handles deterministic daily puzzle selection, state persistence, lockout, player stats, and guest/auth profile management.
import { TARGET_WORDS } from "../gameLogic";
import { supabase } from "./supabase";
import { getAuthProfile, updateAccountCallsign } from "./authService";

const DAILY_STATE_PREFIX = "geotrace_daily_";
const STATS_KEY = "geotrace_stats";
const PROFILE_KEY = "geotrace_profile";

// Epoch anchor date is yesterday (2026-08-29 UTC), so today (2026-08-30 UTC) is Daily #2
const EPOCH_DATE = new Date("2026-08-29T00:00:00Z");

/**
 * Deterministic pseudo-random number generator (Mulberry32)
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Get current UTC date string formatted as YYYY-MM-DD
 * @returns {string}
 */
export function getTodayDateKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Calculate the daily puzzle number based on days elapsed since EPOCH
 * @param {string} [dateKey] - Optional YYYY-MM-DD date key
 * @returns {number}
 */
export function getDailyPuzzleNumber(dateKey = getTodayDateKey()) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  const diffTime = date.getTime() - EPOCH_DATE.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1);
}

/**
 * Deterministically pick today's solution word based on the daily date and level
 * @param {string} [dateKey]
 * @param {string} [levelId]
 * @returns {{ puzzleNumber: number, dateKey: string, levelId: string, solution: string }}
 */
export function getDailyPuzzleInfo(
  dateKey = getTodayDateKey(),
  levelId = "levelone",
) {
  const puzzleNumber = getDailyPuzzleNumber(dateKey);
  const levelHash = (levelId || "levelone")
    .split("")
    .reduce((acc, c) => acc * 31 + c.charCodeAt(0), 7);
  // Seed PRNG with the puzzle number combined with level hash
  const rng = mulberry32(puzzleNumber * 2654435761 + levelHash);
  const randomIndex = Math.floor(rng() * TARGET_WORDS.length);
  const solution = TARGET_WORDS[randomIndex] || TARGET_WORDS[0];

  return {
    puzzleNumber,
    dateKey,
    levelId,
    solution,
  };
}

/**
 * Load saved state for a specific date and level
 * @param {string} [dateKey]
 * @param {string} [levelId]
 * @returns {object|null}
 */
export function getSavedDailyState(
  dateKey = getTodayDateKey(),
  levelId = "levelone",
) {
  try {
    const raw = localStorage.getItem(
      `${DAILY_STATE_PREFIX}${dateKey}_${levelId}`,
    );
    if (raw) return JSON.parse(raw);
    // Legacy fallback without levelId for levelone
    if (levelId === "levelone") {
      const fallback = localStorage.getItem(`${DAILY_STATE_PREFIX}${dateKey}`);
      if (fallback) return JSON.parse(fallback);
    }
    return null;
  } catch (err) {
    console.error("Error reading saved daily state:", err);
    return null;
  }
}

/**
 * Save in-progress or completed daily state for a specific level
 * @param {string} dateKey
 * @param {object} state
 * @param {string} [levelId]
 */
export function saveDailyState(dateKey, state, levelId = "levelone") {
  try {
    localStorage.setItem(
      `${DAILY_STATE_PREFIX}${dateKey}_${levelId}`,
      JSON.stringify({
        ...state,
        levelId,
        lastSavedAt: new Date().toISOString(),
      }),
    );
  } catch (err) {
    console.error("Error saving daily state:", err);
  }
}

/**
 * Generate a simple random UUID fallback
 */
function generateUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get active player profile (authenticated profile if logged in, otherwise local guest profile)
 * @returns {{ id: string, callsign: string, isRegistered: boolean, email?: string }}
 */
export function getPlayerProfile() {
  // Check if authenticated
  const authProfile = getAuthProfile();
  if (authProfile && authProfile.id) {
    return {
      id: authProfile.id,
      callsign: authProfile.callsign,
      isRegistered: true,
      email: authProfile.email,
    };
  }

  // Otherwise, guest profile (local only)
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const guest = JSON.parse(raw);
      return { ...guest, isRegistered: false };
    }
  } catch {}

  const defaultProfile = {
    id: generateUUID(),
    callsign: `Agent-${Math.floor(100 + Math.random() * 900)}`,
    isRegistered: false,
    createdAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(defaultProfile));
  } catch {}

  return defaultProfile;
}

/**
 * Update player callsign
 * @param {string} callsign
 * @returns {Promise<{ success: boolean, profile: object, error?: string }>}
 */
export async function updatePlayerCallsign(callsign) {
  const authProfile = getAuthProfile();

  if (authProfile && authProfile.id) {
    const res = await updateAccountCallsign(callsign);
    if (res.success) {
      return { success: true, profile: getPlayerProfile() };
    }
    return res;
  }

  // Guest callsign update (local only)
  const clean = callsign.trim().slice(0, 16) || "Agent-001";
  const guest = getPlayerProfile();
  guest.callsign = clean;
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(guest));
  } catch {}

  return { success: true, profile: guest };
}

/**
 * Get player career statistics
 * @returns {{ gamesPlayed: number, gamesWon: number, currentStreak: number, maxStreak: number, winDistribution: number[], highScores: number[], averageScore: number, lastPlayedDate: string|null }}
 */
export function getPlayerStats() {
  const defaultStats = {
    gamesPlayed: 0,
    gamesWon: 0,
    currentStreak: 0,
    maxStreak: 0,
    winDistribution: [0, 0, 0, 0, 0, 0], // guesses 1 through 6
    highScores: [],
    averageScore: 0,
    lastPlayedDate: null,
  };

  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      return { ...defaultStats, ...JSON.parse(raw) };
    }
  } catch {}

  return defaultStats;
}

/**
 * Update player stats when a game concludes
 * @param {string} dateKey
 * @param {boolean} isWin
 * @param {number} guessesCount
 * @param {number} score
 */
export function recordGameResult(dateKey, isWin, guessesCount, score) {
  const stats = getPlayerStats();

  // Prevent double-counting the same day
  if (stats.lastPlayedDate === dateKey) {
    return stats;
  }

  stats.gamesPlayed += 1;
  if (isWin) {
    stats.gamesWon += 1;
    if (guessesCount >= 1 && guessesCount <= 6) {
      stats.winDistribution[guessesCount - 1] += 1;
    }

    // Check streak
    if (stats.lastPlayedDate) {
      const lastDate = new Date(`${stats.lastPlayedDate}T00:00:00Z`);
      const currentDate = new Date(`${dateKey}T00:00:00Z`);
      const dayDiff = Math.round(
        (currentDate - lastDate) / (1000 * 60 * 60 * 24),
      );

      if (dayDiff === 1) {
        stats.currentStreak += 1;
      } else if (dayDiff > 1) {
        stats.currentStreak = 1;
      }
    } else {
      stats.currentStreak = 1;
    }

    if (stats.currentStreak > stats.maxStreak) {
      stats.maxStreak = stats.currentStreak;
    }
  } else {
    stats.currentStreak = 0;
  }

  stats.lastPlayedDate = dateKey;

  // Track high score and average
  if (!stats.highScores) stats.highScores = [];
  stats.highScores.push(score);
  stats.highScores.sort((a, b) => b - a);
  stats.highScores = stats.highScores.slice(0, 10);
  const totalScore = stats.highScores.reduce((sum, s) => sum + s, 0);
  stats.averageScore = Math.round(totalScore / stats.highScores.length);

  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {}

  return stats;
}

/**
 * Calculate time remaining until next UTC midnight
 * @returns {{ hours: number, minutes: number, seconds: number, formatted: string, totalSeconds: number }}
 */
export function getTimeUntilNextPuzzle() {
  const now = new Date();
  const nextMidnight = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
    ),
  );

  const diffMs = Math.max(0, nextMidnight.getTime() - now.getTime());
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const formatted = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    hours,
    minutes,
    seconds,
    totalSeconds,
    formatted,
  };
}
