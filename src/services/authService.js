// Authentication & Account Service for Geotrace
// Manages Supabase Auth, verified profiles, unique callsign validation, and guest migration.
import { supabase } from "./supabase";

const AUTH_PROFILE_KEY = "geotrace_auth_profile";
const GUEST_PROFILE_KEY = "geotrace_profile";

/**
 * Validate format of a desired callsign
 * @param {string} callsign
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCallsignFormat(callsign) {
  if (!callsign || typeof callsign !== "string") {
    return { valid: false, error: "Callsign is required." };
  }
  const clean = callsign.trim();
  if (clean.length < 3) {
    return { valid: false, error: "Callsign must be at least 3 characters." };
  }
  if (clean.length > 16) {
    return { valid: false, error: "Callsign cannot exceed 16 characters." };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) {
    return {
      valid: false,
      error: "Only letters, numbers, underscores, and hyphens allowed.",
    };
  }
  return { valid: true };
}

/**
 * Check if a callsign is available to be claimed
 * @param {string} callsign
 * @param {string} [currentUserId]
 * @returns {Promise<{ available: boolean, reason?: string }>}
 */
export async function checkCallsignAvailability(
  callsign,
  currentUserId = null,
) {
  const format = validateCallsignFormat(callsign);
  if (!format.valid) {
    return { available: false, reason: format.error };
  }

  if (!supabase) {
    return { available: true };
  }

  const clean = callsign.trim();

  try {
    // 1. Try RPC check_callsign_available if installed
    const { data: rpcAvailable, error: rpcError } = await supabase.rpc(
      "check_callsign_available",
      {
        requested_callsign: clean,
        requesting_user_id: currentUserId,
      },
    );

    if (!rpcError && typeof rpcAvailable === "boolean") {
      return {
        available: rpcAvailable,
        reason: rpcAvailable ? undefined : "Callsign is already claimed.",
      };
    }

    // 2. Fallback direct table query
    const { data, error } = await supabase
      .from("profiles")
      .select("id, callsign")
      .ilike("callsign", clean)
      .limit(1);

    if (error) {
      console.warn("Callsign query error:", error);
      return { available: true };
    }

    if (data && data.length > 0) {
      if (currentUserId && data[0].id === currentUserId) {
        return { available: true };
      }
      return { available: false, reason: "Callsign is already claimed." };
    }

    return { available: true };
  } catch (err) {
    console.warn("Error checking callsign availability:", err);
    return { available: true };
  }
}

/**
 * Get the locally cached authenticated profile
 * @returns {{ id: string, email: string, callsign: string, isRegistered: boolean } | null}
 */
export function getAuthProfile() {
  try {
    const raw = localStorage.getItem(AUTH_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Save auth profile to localStorage cache
 * @param {object|null} profile
 */
function setAuthProfile(profile) {
  try {
    if (profile) {
      localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    } else {
      localStorage.removeItem(AUTH_PROFILE_KEY);
    }
  } catch (err) {
    console.error("Error saving auth profile:", err);
  }
}

/**
 * Publish unclaimed local guest scores to the new/authenticated user
 * @param {string} newUserId
 * @param {string} newCallsign
 */
async function migrateGuestDataToUser(newUserId, newCallsign) {
  try {
    const lbRaw = localStorage.getItem("geotrace_leaderboard_history");
    if (!lbRaw) return;

    const history = JSON.parse(lbRaw);
    let changed = false;

    for (const key of Object.keys(history)) {
      const entry = history[key];
      if (!entry) continue;

      // 1. Unclaimed local guest score -> publish to this user's account once
      if (!entry.claimedByUserId) {
        entry.claimedByUserId = newUserId;
        entry.userId = newUserId;
        entry.playerName = newCallsign;
        entry.isRegistered = true;
        changed = true;

        if (supabase) {
          try {
            await supabase.from("leaderboard_entries").upsert(
              {
                id: `sub-${newUserId}-${entry.dateKey}-${entry.levelId || "levelone"}`,
                user_id: newUserId,
                player_name: newCallsign,
                level_id: entry.levelId || "levelone",
                puzzle_number: entry.puzzleNumber,
                date_key: entry.dateKey,
                score: entry.score,
                guesses_count: entry.guessesCount,
                time_seconds: entry.timeSeconds,
                tier: entry.tier,
                game_state: entry.gameState,
                submitted_at: entry.submittedAt || new Date().toISOString(),
              },
              { onConflict: "user_id,date_key,level_id" },
            );
          } catch (err) {
            console.warn("Error uploading unclaimed score to Supabase:", err);
          }
        }
      } else if (entry.claimedByUserId === newUserId) {
        // 2. Already claimed by this same user -> update player_name if callsign changed
        if (entry.playerName !== newCallsign) {
          entry.playerName = newCallsign;
          changed = true;
          if (supabase) {
            try {
              await supabase
                .from("leaderboard_entries")
                .update({ player_name: newCallsign })
                .eq("user_id", newUserId)
                .eq("date_key", entry.dateKey);
            } catch (err) {
              console.warn("Error updating player name on Supabase:", err);
            }
          }
        }
      }
      // 3. entry.claimedByUserId && entry.claimedByUserId !== newUserId
      // This score was already claimed by another account on this device. Do NOT duplicate or overwrite.
    }

    if (changed) {
      localStorage.setItem(
        "geotrace_leaderboard_history",
        JSON.stringify(history),
      );
    }
  } catch (err) {
    console.warn("Guest data migration notice:", err);
  }
}

/**
 * Generate a deterministic internal auth email from a callsign for players who skip email
 * @param {string} callsign
 * @returns {string}
 */
function generateSyntheticEmail(callsign) {
  const clean = callsign.toLowerCase().replace(/[^a-z0-9_-]/g, "");
  return `${clean || "operator"}@geotrace.internal`;
}

/**
 * Register a new operator account with Supabase Auth (Email is optional)
 * @param {{ email?: string, password: string, callsign: string }} payload
 * @returns {Promise<{ success: boolean, profile?: object, error?: string }>}
 */
export async function signUp({ email, password, callsign }) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase client is not connected.",
    };
  }

  const cleanName = callsign.trim();
  const format = validateCallsignFormat(cleanName);
  if (!format.valid) {
    return { success: false, error: format.error };
  }

  // 1. Verify callsign availability
  const availability = await checkCallsignAvailability(cleanName);
  if (!availability.available) {
    return {
      success: false,
      error: availability.reason || "Callsign is already claimed.",
    };
  }

  if (!password || password.length < 6) {
    return {
      success: false,
      error: "Password must be at least 6 characters long.",
    };
  }

  const hasRealEmail = Boolean(email && email.trim());
  const cleanEmail = hasRealEmail ? email.trim() : null;
  const authEmail = hasRealEmail
    ? cleanEmail
    : generateSyntheticEmail(cleanName);

  try {
    // 2. Sign up via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: authEmail,
      password,
      options: {
        data: {
          callsign: cleanName,
          email: cleanEmail,
          has_real_email: hasRealEmail,
        },
      },
    });

    if (authError) {
      return { success: false, error: authError.message };
    }

    const user = authData.user;
    if (!user) {
      return {
        success: false,
        error: "Failed to create account. Please try again.",
      };
    }

    // 3. Upsert registered profile in public.profiles
    const profilePayload = {
      id: user.id,
      callsign: cleanName,
      email: cleanEmail,
      is_registered: true,
      updated_at: new Date().toISOString(),
    };

    await supabase
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });

    const authProfile = {
      id: user.id,
      email: cleanEmail,
      callsign: cleanName,
      isRegistered: true,
      createdAt: user.created_at || new Date().toISOString(),
    };

    setAuthProfile(authProfile);

    // 4. Migrate and publish unclaimed guest game records to this user
    await migrateGuestDataToUser(user.id, cleanName);

    return { success: true, profile: authProfile };
  } catch (err) {
    return {
      success: false,
      error: err.message || "An unexpected error occurred during registration.",
    };
  }
}

/**
 * Sign in existing operator account using Callsign OR Email + Password
 * @param {{ identifier?: string, email?: string, password: string }} payload
 * @returns {Promise<{ success: boolean, profile?: object, error?: string }>}
 */
export async function signIn({ identifier, email, password }) {
  if (!supabase) {
    return {
      success: false,
      error: "Supabase client is not connected.",
    };
  }

  const rawIdent = (identifier || email || "").trim();
  if (!rawIdent || !password) {
    return {
      success: false,
      error: "Please enter both callsign/email and password.",
    };
  }

  try {
    let authEmailToTry = null;

    // 1. If identifier looks like a full email with '@' and '.', try direct email auth first
    if (rawIdent.includes("@") && rawIdent.includes(".")) {
      authEmailToTry = rawIdent;
    } else {
      // 2. Identifier is a callsign: look up profile by callsign to find registered email if any
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, callsign, email")
        .ilike("callsign", rawIdent)
        .maybeSingle();

      if (profileRow && profileRow.email) {
        authEmailToTry = profileRow.email;
      } else {
        authEmailToTry = generateSyntheticEmail(rawIdent);
      }
    }

    // Attempt sign in
    let authResult = await supabase.auth.signInWithPassword({
      email: authEmailToTry,
      password,
    });

    // Fallback: If initial attempt failed and identifier wasn't a real email, try synthetic email
    if (authResult.error && !rawIdent.includes("@")) {
      const syntheticFallback = generateSyntheticEmail(rawIdent);
      if (syntheticFallback !== authEmailToTry) {
        authResult = await supabase.auth.signInWithPassword({
          email: syntheticFallback,
          password,
        });
      }
    }

    if (authResult.error) {
      return {
        success: false,
        error: "Invalid callsign/email or password.",
      };
    }

    const user = authResult.data.user;
    if (!user) {
      return { success: false, error: "User not found." };
    }

    // Fetch profile
    let callsign = user.user_metadata?.callsign || rawIdent;
    let userEmail =
      user.user_metadata?.email ||
      (user.email && !user.email.endsWith("@geotrace.internal")
        ? user.email
        : null);

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileRow) {
      callsign = profileRow.callsign;
      userEmail = profileRow.email || userEmail;
    } else {
      // Upsert profile if missing
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          callsign,
          email: userEmail,
          is_registered: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }

    const authProfile = {
      id: user.id,
      email: userEmail,
      callsign,
      isRegistered: true,
      createdAt: user.created_at || new Date().toISOString(),
    };

    setAuthProfile(authProfile);

    // Also migrate and publish unclaimed guest scores on this device to this user
    await migrateGuestDataToUser(user.id, callsign);

    return { success: true, profile: authProfile };
  } catch (err) {
    return {
      success: false,
      error: err.message || "An unexpected error occurred during sign in.",
    };
  }
}

/**
 * Sign out current operator
 * @returns {Promise<{ success: boolean }>}
 */
export async function signOut() {
  if (supabase) {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("Supabase signOut notice:", err);
    }
  }
  setAuthProfile(null);
  return { success: true };
}

/**
 * Update authenticated player's callsign with uniqueness check
 * @param {string} newCallsign
 * @returns {Promise<{ success: boolean, profile?: object, error?: string }>}
 */
export async function updateAccountCallsign(newCallsign) {
  const current = getAuthProfile();
  if (!current || !current.id) {
    return {
      success: false,
      error: "You must be signed in to update an account callsign.",
    };
  }

  const clean = newCallsign.trim();
  const format = validateCallsignFormat(clean);
  if (!format.valid) {
    return { success: false, error: format.error };
  }

  const availability = await checkCallsignAvailability(clean, current.id);
  if (!availability.available) {
    return {
      success: false,
      error: availability.reason || "Callsign is already claimed.",
    };
  }

  if (supabase) {
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          callsign: clean,
          updated_at: new Date().toISOString(),
        })
        .eq("id", current.id);

      if (pErr) {
        return { success: false, error: pErr.message };
      }

      await supabase
        .from("leaderboard_entries")
        .update({ player_name: clean })
        .eq("user_id", current.id);
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  const updatedProfile = { ...current, callsign: clean };
  setAuthProfile(updatedProfile);
  return { success: true, profile: updatedProfile };
}

/**
 * Listen to Supabase auth state changes
 * @param {(event: string, session: any) => void} callback
 * @returns {{ unsubscribe: () => void }}
 */
export function onAuthStateChange(callback) {
  if (!supabase) {
    return { unsubscribe: () => {} };
  }

  const { data: listener } = supabase.auth.onAuthStateChange(
    (event, session) => {
      if (event === "SIGNED_OUT") {
        setAuthProfile(null);
      } else if (
        session &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION")
      ) {
        const user = session.user;
        const callsign =
          user.user_metadata?.callsign ||
          getAuthProfile()?.callsign ||
          `Agent-${user.id.slice(0, 4).toUpperCase()}`;

        const authProfile = {
          id: user.id,
          email: user.email,
          callsign,
          isRegistered: true,
          createdAt: user.created_at || new Date().toISOString(),
        };
        setAuthProfile(authProfile);
      }
      callback(event, session);
    },
  );

  return {
    unsubscribe: () => {
      listener?.subscription?.unsubscribe();
    },
  };
}
