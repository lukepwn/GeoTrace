// Feedback Service for GeoTrace
// Captures player feedback, bug reports, and puzzle reviews with Supabase cloud persistence and offline fallback.
import { supabase, isSupabaseConfigured } from "./supabase";

const OFFLINE_FEEDBACK_KEY = "geotrace_offline_feedback";

/**
 * Collect safe, non-sensitive client diagnostic metadata
 */
function getClientDiagnostics() {
  if (typeof window === "undefined") return {};

  return {
    screenWidth: window.innerWidth,
    screenHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    language: navigator.language || "en",
    platform: navigator.platform || "unknown",
    userAgent: navigator.userAgent || "unknown",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Submit player feedback
 * @param {object} params
 * @param {string} params.category - 'bug' | 'puzzle_issue' | 'suggestion' | 'general'
 * @param {string} params.message - Player feedback content
 * @param {string} [params.email] - Optional contact email
 * @param {object} [params.profile] - Active operator profile
 * @param {number} [params.puzzleNumber] - Current daily puzzle number
 * @param {string} [params.levelId] - Sector / Map theme id
 * @param {string} [params.gameState] - 'PLAYING' | 'WON' | 'LOST'
 * @param {number} [params.elapsedSeconds] - Game duration in seconds
 * @param {number} [params.guessesCount] - Number of guesses submitted
 * @returns {Promise<{ success: boolean, error?: string, offline?: boolean }>}
 */
export async function submitPlayerFeedback({
  category = "general",
  message = "",
  email = "",
  profile = null,
  puzzleNumber = null,
  levelId = "levelone",
  gameState = "PLAYING",
  elapsedSeconds = 0,
  guessesCount = 0,
}) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return {
      success: false,
      error: "Please enter your message before submitting.",
    };
  }

  if (trimmedMessage.length > 1500) {
    return {
      success: false,
      error: "Message is too long. Please keep it under 1,500 characters.",
    };
  }

  const payload = {
    user_id: profile?.id || null,
    callsign: profile?.callsign || "Guest",
    email: email.trim() || profile?.email || null,
    category,
    message: trimmedMessage,
    puzzle_number: puzzleNumber ?? null,
    level_id: levelId,
    game_state: gameState,
    metadata: {
      ...getClientDiagnostics(),
      elapsedSeconds,
      guessesCount,
      isRegistered: Boolean(profile?.isRegistered),
    },
  };

  // 1. Try Supabase cloud persistence if configured
  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase.from("feedback").insert([payload]);

      if (!error) {
        return { success: true };
      }

      console.warn(
        "Supabase feedback insert error, falling back to local storage:",
        error.message,
      );
    } catch (err) {
      console.warn("Supabase feedback network exception, falling back:", err);
    }
  }

  // 2. Offline / Local fallback queue
  try {
    const raw = localStorage.getItem(OFFLINE_FEEDBACK_KEY);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      ...payload,
      id: `offline_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      created_at: new Date().toISOString(),
    });
    // Keep max 20 offline items
    localStorage.setItem(
      OFFLINE_FEEDBACK_KEY,
      JSON.stringify(list.slice(0, 20)),
    );
    return { success: true, offline: true };
  } catch (storageErr) {
    console.error("Local feedback storage error:", storageErr);
    return { success: true, offline: true };
  }
}
