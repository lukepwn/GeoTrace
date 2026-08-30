import React, { useRef } from "react";
import {
  BarChart2,
  ChevronLeft,
  Flame,
  Trophy,
  Target,
  X,
  Star,
} from "lucide-react";
import { getPlayerStats } from "../services/dailyGame";

export default function StatsModal({
  isOpen,
  onClose,
  isOpenedFromSettings = false,
}) {
  const backdropMouseDownRef = useRef(false);

  if (!isOpen) return null;

  const stats = getPlayerStats();
  const winRate =
    stats && stats.gamesPlayed > 0
      ? Math.round((stats.gamesWon / stats.gamesPlayed) * 100)
      : 0;

  const winDistribution = stats?.winDistribution || [0, 0, 0, 0, 0, 0];
  const maxDistribution = Math.max(1, ...winDistribution);

  return (
    <div
      className="stats-backdrop"
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
        className="stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stats-title"
      >
        <div className="stats-header">
          <div className="stats-header-left">
            <div className="stats-header-icon">
              <BarChart2 size={24} />
            </div>
            <div>
              <p className="stats-kicker">Operator Career Record</p>
              <h2 id="stats-title">Signal Statistics</h2>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label={
              isOpenedFromSettings ? "Back to Settings" : "Close statistics"
            }
            title={isOpenedFromSettings ? "Back to Settings" : "Close"}
          >
            {isOpenedFromSettings ? <ChevronLeft size={18} /> : <X size={18} />}
          </button>
        </div>

        {/* Top Summary Grid */}
        <div className="stats-summary-grid">
          <div className="stat-card">
            <span className="stat-card-value">{stats.gamesPlayed}</span>
            <span className="stat-card-label">Played</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{winRate}%</span>
            <span className="stat-card-label">Win Rate</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value stat-card-value--streak">
              <Flame size={18} />
              {stats.currentStreak}
            </span>
            <span className="stat-card-label">Current Streak</span>
          </div>
          <div className="stat-card">
            <span className="stat-card-value">{stats.maxStreak}</span>
            <span className="stat-card-label">Max Streak</span>
          </div>
        </div>

        {/* Score Benchmark */}
        <div className="stats-score-benchmarks">
          <div className="benchmark-item">
            <span className="benchmark-label">Top Score Banked</span>
            <strong className="benchmark-val">
              <Star size={16} />
              {stats.highScores && stats.highScores[0]
                ? `${stats.highScores[0]} pts`
                : "--"}
            </strong>
          </div>
          <div className="benchmark-divider" />
          <div className="benchmark-item">
            <span className="benchmark-label">Average Score</span>
            <strong className="benchmark-val">
              {stats.averageScore ? `${stats.averageScore} pts` : "--"}
            </strong>
          </div>
        </div>

        {/* Guess Distribution Chart */}
        <div className="stats-distribution-section">
          <h3 className="distribution-title">Guess Distribution</h3>
          <div className="distribution-bars">
            {winDistribution.map((count, index) => {
              const guessNum = index + 1;
              const percentage =
                count > 0
                  ? Math.max(8, Math.round((count / maxDistribution) * 100))
                  : 5;
              const isHighlight = count > 0 && count === maxDistribution;

              return (
                <div key={guessNum} className="distribution-row">
                  <span className="distribution-num">{guessNum}</span>
                  <div className="distribution-track">
                    <div
                      className={`distribution-fill${isHighlight ? " distribution-fill--highlight" : ""}`}
                      style={{ width: `${percentage}%` }}
                    >
                      <span className="distribution-count">{count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
