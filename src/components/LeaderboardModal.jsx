import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  Trophy,
  Medal,
  Timer,
  Edit2,
  Check,
  ChevronLeft,
  X,
  Star,
  Users,
  Flame,
  Clock,
  Radio,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  fetchDailyLeaderboard,
  formatDuration,
} from "../services/leaderboardService";
import {
  getPlayerProfile,
  updatePlayerCallsign,
  getTimeUntilNextPuzzle,
} from "../services/dailyGame";

export default function LeaderboardModal({
  isOpen,
  onClose,
  dateKey,
  puzzleNumber,
  levelId = "levelone",
  levelName = "Archipelago",
  isOpenedFromSettings = false,
  onOpenAuth,
}) {
  const [leaderboardData, setLeaderboardData] = useState({
    leaderboard: [],
    userRank: null,
    userEntry: null,
    totalPlayers: 0,
    isLive: false,
  });
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(
    () => getTimeUntilNextPuzzle().formatted,
  );
  const [isEditingCallsign, setIsEditingCallsign] = useState(false);
  const [callsignInput, setCallsignInput] = useState("");
  const [editError, setEditError] = useState("");
  const [savingCallsign, setSavingCallsign] = useState(false);
  const [profile, setProfile] = useState(() => getPlayerProfile());
  const backdropMouseDownRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDailyLeaderboard(dateKey, levelId);
      setLeaderboardData(data);
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
    } finally {
      setLoading(false);
    }
  }, [dateKey, levelId]);

  useEffect(() => {
    if (isOpen) {
      loadData();
      const currentProfile = getPlayerProfile();
      setProfile(currentProfile);
      setCallsignInput(currentProfile.callsign);
      setEditError("");
      setIsEditingCallsign(false);
    }
  }, [isOpen, loadData]);

  // Next signal countdown timer
  useEffect(() => {
    if (!isOpen) return undefined;
    const interval = setInterval(() => {
      setCountdown(getTimeUntilNextPuzzle().formatted);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const handleSaveCallsign = async (e) => {
    e.preventDefault();
    if (!callsignInput.trim()) return;
    setEditError("");
    setSavingCallsign(true);

    try {
      const res = await updatePlayerCallsign(callsignInput);
      if (res.success) {
        setProfile(res.profile);
        setIsEditingCallsign(false);
        loadData();
      } else {
        setEditError(res.error || "Could not update callsign.");
      }
    } catch (err) {
      setEditError(err.message || "An error occurred.");
    } finally {
      setSavingCallsign(false);
    }
  };

  if (!isOpen) return null;

  const {
    leaderboard = [],
    userRank = null,
    userEntry = null,
    totalPlayers = 0,
    isLive = false,
  } = leaderboardData || {};
  const isUserInTop10 = userRank && userRank <= 10;
  const isVerified = Boolean(profile?.isRegistered);

  return (
    <div
      className="leaderboard-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          onClose();
        }
        backdropMouseDownRef.current = false;
      }}
    >
      <section
        className="leaderboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaderboard-title"
      >
        {/* Header */}
        <div className="leaderboard-header">
          <div className="leaderboard-header-left">
            <div className="leaderboard-header-icon">
              <Trophy size={24} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {isLive && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      backgroundColor: "#22c55e",
                      boxShadow: "0 0 8px #22c55e",
                    }}
                    title="Connected to Live Database"
                  />
                )}
                <p className="leaderboard-kicker">
                  {isLive ? "Live Transmission Log" : "Global Transmission Log"}
                </p>
              </div>
              <h2 id="leaderboard-title">Daily Leaderboard</h2>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={
              isOpenedFromSettings ? "Back to Settings" : "Close leaderboard"
            }
            title={isOpenedFromSettings ? "Back to Settings" : "Close"}
          >
            {isOpenedFromSettings ? <ChevronLeft size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* Subheader info bar */}
        <div className="leaderboard-subbar">
          <div className="subbar-item">
            <span className="subbar-label">Daily Signal</span>
            <strong className="subbar-value">GeoTrace #{puzzleNumber}</strong>
          </div>
          <div className="subbar-divider" />
          <div className="subbar-item">
            <span className="subbar-label">Map / Level</span>
            <strong className="subbar-value">{levelName}</strong>
          </div>
          <div className="subbar-divider" />
          <div className="subbar-item">
            <span className="subbar-label">Next Signal In</span>
            <strong className="subbar-value countdown-highlight">
              <Clock size={14} />
              {countdown}
            </strong>
          </div>
        </div>

        {/* Callsign bar */}
        <div className="callsign-bar">
          <div className="callsign-info">
            <span className="callsign-label">Your Callsign:</span>
            {isEditingCallsign ? (
              <form
                onSubmit={handleSaveCallsign}
                className="callsign-edit-form"
              >
                <input
                  type="text"
                  maxLength={16}
                  value={callsignInput}
                  onChange={(e) => {
                    setCallsignInput(e.target.value);
                    setEditError("");
                  }}
                  className="callsign-input"
                  autoFocus
                  placeholder="Enter callsign"
                  disabled={savingCallsign}
                />
                <button
                  type="submit"
                  className="callsign-btn-save"
                  title="Save Callsign"
                  disabled={savingCallsign}
                >
                  {savingCallsign ? (
                    <Loader2 size={13} className="spin" />
                  ) : (
                    <Check size={14} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingCallsign(false);
                    setEditError("");
                  }}
                  className="callsign-btn-cancel"
                  title="Cancel"
                  disabled={savingCallsign}
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <div className="callsign-display">
                <strong className="callsign-text">{profile.callsign}</strong>
                {isVerified ? (
                  <span
                    className="verified-badge"
                    title="Verified Operator Account"
                  >
                    <ShieldCheck size={13} />
                    <span>Verified</span>
                  </span>
                ) : (
                  <span
                    className="guest-badge"
                    title="Temporary Guest Callsign"
                  >
                    Guest
                  </span>
                )}

                {isVerified ? (
                  <button
                    type="button"
                    className="callsign-edit-trigger"
                    onClick={() => {
                      setCallsignInput(profile.callsign);
                      setIsEditingCallsign(true);
                      setEditError("");
                    }}
                    title="Change your verified callsign"
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>
                ) : (
                  onOpenAuth && (
                    <button
                      type="button"
                      className="callsign-claim-trigger"
                      onClick={() => onOpenAuth("signup")}
                      title="Reserve your unique callsign with an account"
                    >
                      <Sparkles size={13} />
                      <span>Claim Callsign</span>
                    </button>
                  )
                )}
              </div>
            )}
            {editError && (
              <div className="callsign-error-msg">
                <AlertCircle size={12} />
                <span>{editError}</span>
              </div>
            )}
          </div>
          {userRank && (
            <div className="user-rank-pill">
              <span>Today's Rank:</span>
              <strong>#{userRank}</strong>
            </div>
          )}
        </div>

        {/* Table content */}
        <div className="leaderboard-table-container">
          {loading ? (
            <div className="leaderboard-loading">
              <div className="scanner-line" />
              <span>Scanning global frequencies...</span>
            </div>
          ) : (
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th className="th-rank">Rank</th>
                  <th className="th-player">Operator</th>
                  <th className="th-tier">Tier</th>
                  <th className="th-guesses">Guesses</th>
                  <th className="th-time">Time</th>
                  <th className="th-score">Score</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 50).map((entry) => {
                  const isTop1 = entry.rank === 1;
                  const isTop2 = entry.rank === 2;
                  const isTop3 = entry.rank === 3;
                  const isMe = entry.isCurrentUser;

                  return (
                    <tr
                      key={entry.id}
                      className={`lb-row${isMe ? " lb-row--current" : ""}${isTop1 ? " lb-row--first" : ""}`}
                    >
                      <td className="td-rank">
                        {isTop1 ? (
                          <span className="rank-badge rank-badge--gold">
                            <Medal size={14} /> 1
                          </span>
                        ) : isTop2 ? (
                          <span className="rank-badge rank-badge--silver">
                            <Medal size={14} /> 2
                          </span>
                        ) : isTop3 ? (
                          <span className="rank-badge rank-badge--bronze">
                            <Medal size={14} /> 3
                          </span>
                        ) : (
                          <span className="rank-num">#{entry.rank}</span>
                        )}
                      </td>
                      <td className="td-player">
                        <span className="player-name">
                          {entry.playerName}
                          {isMe && <span className="you-tag">YOU</span>}
                        </span>
                      </td>
                      <td className="td-tier">
                        <span
                          className={`tier-pill tier-pill--${(entry.tier || "d").toLowerCase()}`}
                        >
                          {entry.tier || "D"}
                        </span>
                      </td>
                      <td className="td-guesses">{entry.guessesCount}/6</td>
                      <td className="td-time">
                        {formatDuration(entry.timeSeconds)}
                      </td>
                      <td className="td-score">
                        <strong>{entry.score}</strong>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pinned user summary if user played but is not in top visible view */}
        {!loading && userEntry && !isUserInTop10 && (
          <div className="leaderboard-pinned-user">
            <div className="pinned-user-left">
              <span className="pinned-rank">#{userRank}</span>
              <div className="pinned-info">
                <strong>{userEntry.playerName} (You)</strong>
                <span className="pinned-sub">
                  {userEntry.guessesCount}/6 guesses &bull;{" "}
                  {formatDuration(userEntry.timeSeconds)}
                </span>
              </div>
            </div>
            <div className="pinned-user-right">
              <span
                className={`tier-pill tier-pill--${(userEntry.tier || "d").toLowerCase()}`}
              >
                {userEntry.tier}
              </span>
              <strong className="pinned-score">
                <Star size={14} /> {userEntry.score} pts
              </strong>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
