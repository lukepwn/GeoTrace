import React, { useEffect, useState, useCallback } from "react";
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
}) {
  const [leaderboardData, setLeaderboardData] = useState({
    leaderboard: [],
    userRank: null,
    userEntry: null,
    totalPlayers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(
    () => getTimeUntilNextPuzzle().formatted,
  );
  const [isEditingCallsign, setIsEditingCallsign] = useState(false);
  const [callsignInput, setCallsignInput] = useState("");
  const [profile, setProfile] = useState(() => getPlayerProfile());

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

  const handleSaveCallsign = (e) => {
    e.preventDefault();
    if (!callsignInput.trim()) return;
    const updated = updatePlayerCallsign(callsignInput);
    setProfile(updated);
    setIsEditingCallsign(false);
    loadData();
  };

  if (!isOpen) return null;

  const { leaderboard, userRank, userEntry, totalPlayers } = leaderboardData;
  const isUserInTop10 = userRank && userRank <= 10;

  return (
    <div
      className="leaderboard-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
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
              <p className="leaderboard-kicker">Global Transmission Log</p>
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
                  onChange={(e) => setCallsignInput(e.target.value)}
                  className="callsign-input"
                  autoFocus
                  placeholder="Enter callsign"
                />
                <button
                  type="submit"
                  className="callsign-btn-save"
                  title="Save Callsign"
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingCallsign(false)}
                  className="callsign-btn-cancel"
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </form>
            ) : (
              <div className="callsign-display">
                <strong>{profile.callsign}</strong>
                <button
                  type="button"
                  className="callsign-edit-trigger"
                  onClick={() => setIsEditingCallsign(true)}
                  title="Change your callsign"
                >
                  <Edit2 size={13} />
                  <span>Edit</span>
                </button>
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
