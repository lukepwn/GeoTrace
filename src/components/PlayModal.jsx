import React from "react";
import {
  Play,
  MapPin,
  BookOpen,
  Trophy,
  BarChart2,
  ShieldCheck,
  User,
  Radio,
  Clock,
  Sparkles,
  Compass,
  Flame,
  ArrowRight,
  Zap,
} from "lucide-react";
import { LEVELS } from "../config/levels";

export default function PlayModal({
  isOpen,
  onPlay,
  puzzleNumber,
  dateKey,
  levelId,
  activeLevel,
  onSelectLevel,
  profile,
  gameState,
  guessesCount = 0,
  score = 0,
  countdown,
  onOpenTutorial,
  onOpenLeaderboard,
  onOpenStats,
  onOpenAuth,
}) {
  if (!isOpen) return null;

  const isGameOver = gameState === "WON" || gameState === "LOST";
  const hasStarted = guessesCount > 0;

  return (
    <div className="play-backdrop" role="presentation">
      <section
        className="play-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="play-modal-title"
      >
        {/* Header */}
        <div className="play-modal-header">
          <div className="play-header-left">
            <div className="play-header-icon">
              <Radio size={24} />
            </div>
            <div>
              <div className="play-header-kicker-row">
                <span className="live-pulse-dot" />
                <p className="play-kicker">Daily Mission Briefing</p>
                <span className="play-date-pill">{dateKey}</span>
              </div>
              <h2 id="play-modal-title">GeoTrace #{puzzleNumber}</h2>
            </div>
          </div>
        </div>

        {/* Mission Objective Card */}
        <div className="play-mission-card">
          <div className="play-mission-info">
            <p className="play-mission-headline">
              Decode today's 5-letter classified coordinates in 6 traces or
              fewer.
            </p>
            <p className="play-mission-sub">
              Pan the satellite map, connect beacons in sequence, and lock in
              your precision bonus.
            </p>
          </div>

          <div className="play-meta-grid">
            <div className="play-meta-item">
              <span className="play-meta-label">Operator</span>
              <div className="play-meta-val">
                {profile?.isRegistered ? (
                  <span className="play-operator-verified">
                    <ShieldCheck size={14} />
                    {profile?.callsign || "Verified"}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="play-operator-guest-btn"
                    onClick={() => onOpenAuth && onOpenAuth("signup")}
                    title="Claim your callsign"
                  >
                    <User size={13} />
                    <span>{profile?.callsign || "Guest"} (Guest)</span>
                  </button>
                )}
              </div>
            </div>

            <div className="play-meta-item">
              <span className="play-meta-label">Next Signal In</span>
              <div className="play-meta-val">
                <Clock size={13} style={{ color: "var(--cyan)" }} />
                <span>{countdown || "--:--:--"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sector / Map Theme Selection */}
        <div className="play-section">
          <div className="play-section-title-row">
            <span className="play-section-title">Deployment Sector</span>
            <span className="play-sector-current">
              {activeLevel?.name || "Sector"}
            </span>
          </div>
          <div className="play-level-grid">
            {(LEVELS || []).map((lvl) => {
              const isActive = lvl.id === levelId;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  className={`play-level-btn${isActive ? " play-level-btn--active" : ""}`}
                  style={{
                    "--level-accent": lvl.theme?.accentColor || "#38bdf8",
                  }}
                  onClick={() => onSelectLevel && onSelectLevel(lvl.id)}
                >
                  <div className="play-level-icon">
                    {lvl.id === "leveltwo" ? (
                      <Flame size={16} />
                    ) : (
                      <Compass size={16} />
                    )}
                  </div>
                  <div className="play-level-text">
                    <span className="play-level-name">{lvl.name}</span>
                    <span className="play-level-sub">{lvl.subtitle}</span>
                  </div>
                  {isActive && <span className="play-active-tag">Active</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary Play Action Button */}
        <div className="play-cta-wrapper">
          <button type="button" className="play-primary-btn" onClick={onPlay}>
            <Play size={20} fill="currentColor" />
            <span>
              {isGameOver
                ? "View Completed Mission"
                : hasStarted
                  ? `Resume Daily Trace (Guess ${guessesCount + 1}/6)`
                  : "Engage Daily Signal"}
            </span>
            <ArrowRight size={18} className="play-arrow-icon" />
          </button>
        </div>

        {/* Quick Hub Navigation Cards */}
        <div className="play-quick-actions">
          <button
            type="button"
            className="play-action-chip"
            onClick={onOpenTutorial}
          >
            <BookOpen size={16} className="play-chip-icon" />
            <div>
              <span className="play-chip-title">How to Play</span>
              <span className="play-chip-sub">Briefing & rules</span>
            </div>
          </button>

          <button
            type="button"
            className="play-action-chip"
            onClick={onOpenLeaderboard}
          >
            <Trophy size={16} className="play-chip-icon" />
            <div>
              <span className="play-chip-title">Leaderboard</span>
              <span className="play-chip-sub">Today's top ranks</span>
            </div>
          </button>

          <button
            type="button"
            className="play-action-chip"
            onClick={onOpenStats}
          >
            <BarChart2 size={16} className="play-chip-icon" />
            <div>
              <span className="play-chip-title">Career Stats</span>
              <span className="play-chip-sub">Win rate & streaks</span>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
