import React, { useCallback, useEffect, useRef, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Delete,
  MapPin,
  Radio,
  Send,
  RotateCcw,
  Settings,
  Share2,
  Star,
  Timer,
  X,
  Zap,
} from "lucide-react";
import WorldMap from "./components/WorldMap.jsx";
import {
  ALLOWED_GUESSES,
  MAX_GUESSES,
  WORD_LENGTH,
  evaluateGuess,
  pickRandomSolution,
} from "./gameLogic";
import "./App.css";

// Rewards how fast each individual guess was submitted (not total game time),
// so a snappy guess late in the round still earns its multiplier.
function speedMultiplier(elapsedSeconds) {
  if (elapsedSeconds < 30) return 2;
  if (elapsedSeconds < 60) return 1.5;
  return 1;
}

// Score tiers are calibrated against realistic play data rather than the raw
// theoretical max: most players (casual 2-4min, stuck 5min+) finish well past
// the speed-multiplier window and rely on precision alone, since beacons must
// be found on the map first. Only fast/skilled players (10-60s, ~4 guesses)
// bank the 1.5x/2x multiplier on more than one or two letters.
const SCORE_TIERS = [
  { tier: "S", min: 300, label: "Legendary" },
  { tier: "A", min: 220, label: "Excellent" },
  { tier: "B", min: 150, label: "Great" },
  { tier: "C", min: 90, label: "Solid" },
  { tier: "D", min: 0, label: "Scraped By" },
];

function getScoreTier(score) {
  return (
    SCORE_TIERS.find((t) => score >= t.min) ??
    SCORE_TIERS[SCORE_TIERS.length - 1]
  );
}

function createInitialState() {
  return {
    solution: pickRandomSolution(),
    guesses: [],
    creditedBonusByChar: {},
    currentTrace: [],
    score: 0,
    elapsedSeconds: 0,
    gameState: "PLAYING",
    statusMessage: "Trace beacons on the map to spell your guess.",
    shakeId: 0,
  };
}

function formatStopwatch(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function fireVictoryConfetti() {
  confetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.6 },
    colors: ["#38bdf8", "#22c55e", "#eab308"],
  });
}

const THEME_STORAGE_KEY = "geotrace-theme";

export default function App() {
  const [state, setState] = useState(createInitialState);
  const [launchPhase, setLaunchPhase] = useState("TUTORIAL");
  const [showExploreHint, setShowExploreHint] = useState(true);
  const [tutorialPage, setTutorialPage] = useState(0);

  const [showSettings, setShowSettings] = useState(false);
  const {
    solution,
    guesses,
    currentTrace,
    score,
    elapsedSeconds,
    gameState,
    statusMessage,
    shakeId,
  } = state;
  const statusTimeoutRef = useRef(null);
  const isPlaying = launchPhase === "PLAYING";

  useEffect(() => {
    if (launchPhase !== "LAUNCHING") return undefined;

    const launchTimeout = setTimeout(() => setLaunchPhase("PLAYING"), 1200);
    return () => clearTimeout(launchTimeout);
  }, [launchPhase]);

  // Stopwatch counts up while playing; it only drives the speed bonus, it never ends the round.
  useEffect(() => {
    if (!isPlaying || gameState !== "PLAYING") return undefined;

    const intervalId = setInterval(() => {
      setState((prev) => {
        if (prev.gameState !== "PLAYING") return prev;
        return { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [gameState, isPlaying]);

  useEffect(() => () => clearTimeout(statusTimeoutRef.current), []);

  const flashStatus = useCallback((message) => {
    clearTimeout(statusTimeoutRef.current);
    setState((prev) => ({ ...prev, statusMessage: message }));
  }, []);

  const handleSelectLetter = useCallback((beacon, meta) => {
    setState((prev) => {
      if (prev.gameState !== "PLAYING") return prev;

      const entry = { beacon, precision: meta.precision, bonus: meta.bonus };
      const existingIndex = prev.currentTrace.findIndex(
        (t) => t.beacon.id === beacon.id,
      );

      // Re-selecting the same beacon repositions its flag instead of adding a duplicate.
      if (existingIndex !== -1) {
        const nextTrace = [...prev.currentTrace];
        nextTrace[existingIndex] = entry;
        return {
          ...prev,
          currentTrace: nextTrace,
          statusMessage: `Flag repositioned — +${meta.bonus} precision bonus.`,
        };
      }

      if (prev.currentTrace.length >= WORD_LENGTH) return prev;
      return {
        ...prev,
        currentTrace: [...prev.currentTrace, entry],
        statusMessage: `+${meta.bonus} precision bonus!`,
      };
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setState((prev) => {
      if (prev.gameState !== "PLAYING" || prev.currentTrace.length === 0)
        return prev;
      return { ...prev, currentTrace: prev.currentTrace.slice(0, -1) };
    });
  }, []);

  // Backspace deletes the last traced beacon, mirroring the toolbar button.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Backspace") return;
      if (!isPlaying || gameState !== "PLAYING") return;
      event.preventDefault();
      handleBackspace();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameState, handleBackspace]);

  const handleSubmit = useCallback(() => {
    setState((prev) => {
      if (prev.gameState !== "PLAYING") return prev;

      if (prev.currentTrace.length !== WORD_LENGTH) {
        return { ...prev, statusMessage: "Trace 5 beacons before submitting." };
      }

      const guessWord = prev.currentTrace.map((t) => t.beacon.char).join("");

      if (!ALLOWED_GUESSES.has(guessWord)) {
        return {
          ...prev,
          statusMessage: `"${guessWord}" is not a recognized word.`,
          shakeId: prev.shakeId + 1,
        };
      }

      const statuses = evaluateGuess(guessWord, prev.solution);
      const currentSpeedMultiplier = speedMultiplier(prev.elapsedSeconds);
      // Re-guessing an already-correct letter can adjust its precision bonus,
      // but the speed multiplier locks in at the moment the letter was first
      // guessed correctly so later, slower guesses can't erode it.
      const nextCreditedBonusByChar = { ...prev.creditedBonusByChar };
      const roundBonus = prev.currentTrace.reduce((sum, trace, index) => {
        if (statuses[index] !== "correct") return sum;
        const char = trace.beacon.char;
        const previous = nextCreditedBonusByChar[char];
        const lockedMultiplier = previous?.multiplier ?? currentSpeedMultiplier;
        const previousBanked = previous
          ? Math.round(previous.bonus * previous.multiplier)
          : 0;
        const nextBanked = Math.round(trace.bonus * lockedMultiplier);
        nextCreditedBonusByChar[char] = {
          bonus: trace.bonus,
          multiplier: lockedMultiplier,
        };
        return sum + (nextBanked - previousBanked);
      }, 0);
      const nextScore = Math.max(0, prev.score + roundBonus);
      const evaluatedRow = { word: guessWord, statuses };
      const nextGuesses = [...prev.guesses, evaluatedRow];
      const isWin = statuses.every((s) => s === "correct");
      const isLastGuess = nextGuesses.length >= MAX_GUESSES;
      const bonusVerb = roundBonus < 0 ? "" : "+";

      if (isWin) {
        return {
          ...prev,
          guesses: nextGuesses,
          creditedBonusByChar: nextCreditedBonusByChar,
          currentTrace: [],
          score: nextScore,
          gameState: "WON",
          statusMessage: `Signal locked! ${bonusVerb}${roundBonus} bonus. The word was ${prev.solution}.`,
        };
      }

      if (isLastGuess) {
        return {
          ...prev,
          guesses: nextGuesses,
          creditedBonusByChar: nextCreditedBonusByChar,
          currentTrace: [],
          score: nextScore,
          gameState: "LOST",
          statusMessage: `Out of guesses. The word was ${prev.solution}.`,
          shakeId: prev.shakeId + 1,
        };
      }

      return {
        ...prev,
        guesses: nextGuesses,
        creditedBonusByChar: nextCreditedBonusByChar,
        currentTrace: [],
        shakeId: prev.shakeId + 1,
        score: nextScore,
        statusMessage: `${bonusVerb}${roundBonus} bonus banked. Keep tracing.`,
      };
    });
  }, []);

  // Enter submits the current trace, mirroring the toolbar button.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Enter") return;
      if (!isPlaying || gameState !== "PLAYING") return;
      event.preventDefault();
      handleSubmit();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, gameState, handleSubmit]);

  useEffect(() => {
    if (gameState === "WON") fireVictoryConfetti();
  }, [gameState]);

  const handleReset = useCallback(() => {
    setState(createInitialState());
  }, []);

  const [shareCopied, setShareCopied] = useState(false);

  const handleShare = useCallback(() => {
    const emojiRows = guesses
      .map((g) =>
        g.statuses
          .map((s) =>
            s === "correct"
              ? "\uD83D\uDFE9"
              : s === "present"
                ? "\uD83D\uDFE8"
                : "\u2B1C",
          )
          .join(""),
      )
      .join("\n");
    const scoreTier = getScoreTier(score);
    const shareText = `GeoTrace ${guesses.length}/${MAX_GUESSES}\n${score} pts (${scoreTier.tier} Tier ${scoreTier.label})\n\n${emojiRows}`;

    navigator.clipboard?.writeText(shareText).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    });
  }, [guesses, score]);

  const multiplier = `${speedMultiplier(elapsedSeconds).toFixed(1)}x`;

  const rows = [];
  for (let i = 0; i < MAX_GUESSES; i += 1) {
    if (guesses[i]) {
      rows.push(guesses[i]);
    } else if (i === guesses.length && gameState === "PLAYING") {
      rows.push({
        word: currentTrace.map((t) => t.beacon.char).join(""),
        statuses: [],
        active: true,
      });
    } else {
      rows.push({ word: "", statuses: [] });
    }
  }

  return (
    <div className="app-shell">
      <button
        type="button"
        className="settings-button"
        onClick={() => setShowSettings(true)}
        aria-label="Open settings"
        title="Settings"
      >
        <Settings size={18} />
      </button>

      <div className="map-area">
        <WorldMap
          currentTrace={currentTrace}
          onSelectLetter={handleSelectLetter}
          onNavigate={() => setShowExploreHint(false)}
          disabled={!isPlaying || gameState !== "PLAYING"}
        />
        <div className="map-timer" title="Elapsed time">
          <Timer size={20} />
          <span>{formatStopwatch(elapsedSeconds)}</span>
        </div>
        {isPlaying && showExploreHint && (
          <div className="explore-hint" role="status">
            <MapPin size={16} aria-hidden="true" />
            Pan and zoom to locate beacons
          </div>
        )}

        <div className="right-dock">
          <header className="hud-float">
            <div className="hud-title">
              <MapPin size={20} className="hud-icon" />
              <h1>GeoTrace</h1>
            </div>
            <div className="hud-badges">
              <div className="badge badge-score" title="Precision bonus score">
                <Star size={16} />
                <span>{score}</span>
              </div>
              <div className="badge badge-multiplier">
                <Zap size={16} />
                <span>{multiplier}</span>
              </div>
            </div>
          </header>

          <section
            className={`deduction-grid${shakeId > 0 ? " deduction-grid--wrong" : ""}`}
            aria-label="Guess history"
            key={shakeId}
          >
            {rows.map((row, rowIndex) => (
              <div
                className={`grid-row${row.active ? " grid-row--active" : ""}`}
                key={rowIndex}
              >
                {Array.from({ length: WORD_LENGTH }).map((_, colIndex) => {
                  const char = row.word[colIndex] || "";
                  const status = row.statuses[colIndex];
                  const tileClass = status
                    ? `tile tile--${status}`
                    : `tile${char ? " tile--filled" : ""}`;
                  return (
                    <div className={tileClass} key={colIndex}>
                      {char}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="action-dock">
            <p className="status-message">{statusMessage}</p>
            <div className="trace-path">
              {Array.from({ length: WORD_LENGTH }).map((_, i) => (
                <span
                  key={i}
                  className={`trace-slot${currentTrace[i] ? " trace-slot--filled" : ""}`}
                >
                  {currentTrace[i]?.beacon.char || ""}
                  {currentTrace[i] && (
                    <em className="trace-slot-bonus">
                      +{currentTrace[i].bonus}
                    </em>
                  )}
                </span>
              ))}
            </div>
            <div className="toolbar-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBackspace}
                disabled={
                  !isPlaying ||
                  gameState !== "PLAYING" ||
                  currentTrace.length === 0
                }
              >
                <Delete size={16} />
                Backspace
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={
                  !isPlaying ||
                  gameState !== "PLAYING" ||
                  currentTrace.length !== WORD_LENGTH
                }
              >
                <Send size={16} />
                Submit Guess
              </button>
              <div>solution: {solution}</div>
            </div>
          </section>
        </div>

        {gameState !== "PLAYING" && (
          <div className="end-overlay">
            <section
              className={`end-panel end-panel--${gameState.toLowerCase()}`}
            >
              <h2>
                {gameState === "WON" ? "Signal Locked!" : "Transmission Lost"}
              </h2>
              <p>
                The word was <strong>{solution}</strong>.
              </p>
              {gameState === "WON" && (
                <div
                  className={`tier-badge tier-badge--${getScoreTier(score).tier.toLowerCase()}`}
                >
                  <span className="tier-badge-rank">
                    {getScoreTier(score).tier}
                  </span>
                  <span className="tier-badge-label">
                    {getScoreTier(score).label}
                  </span>
                </div>
              )}
              {gameState === "WON" && (
                <p className="end-panel-score">
                  <Star size={16} />
                  <strong>{score}</strong> points
                </p>
              )}
              <div className="end-panel-actions">
                {gameState === "WON" && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleShare}
                  >
                    <Share2 size={16} />
                    {shareCopied ? "Copied!" : "Share"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleReset}
                >
                  <RotateCcw size={16} />
                  Play Again
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      {launchPhase === "TUTORIAL" && (
        <div className="tutorial-backdrop" role="presentation">
          <section
            className="tutorial-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
          >
            <div className="tutorial-heading">
              <MapPin size={24} aria-hidden="true" />
              <div>
                <p className="tutorial-kicker">GeoTrace briefing</p>
                <h2 id="tutorial-title">
                  {tutorialPage === 0 ? "How to Play" : "Score the Signal"}
                </h2>
              </div>
            </div>
            {tutorialPage === 0 ? (
              <>
                <p className="tutorial-lede">
                  Trace five beacons on the map to decode the hidden word in six
                  guesses.
                </p>

                <div
                  className="tutorial-trace"
                  aria-label="Connect beacons in order to spell TRACE"
                >
                  <span className="tutorial-trace-label">Connect in order</span>
                  <div className="tutorial-trace-path" aria-hidden="true">
                    {"TRACE".split("").map((letter, index) => (
                      <React.Fragment key={`${letter}-${index}`}>
                        {index > 0 && (
                          <ArrowRight
                            className="tutorial-trace-arrow"
                            size={15}
                          />
                        )}
                        <span className="tutorial-beacon">{letter}</span>
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                <ul className="tutorial-rules">
                  <li>Each trace must form a recognized 5-letter word.</li>
                  <li>
                    Hit close to a beacon center to bank more precision bonus.
                  </li>
                  <li>
                    Tile colors reveal how close your word is to the signal.
                  </li>
                </ul>

                <div
                  className="tutorial-examples"
                  aria-label="Tile color examples"
                >
                  <div className="tutorial-example">
                    <div className="tutorial-example-row" aria-hidden="true">
                      <span className="tutorial-tile tutorial-tile--correct">
                        T
                      </span>
                      <span className="tutorial-tile">R</span>
                      <span className="tutorial-tile">A</span>
                      <span className="tutorial-tile">C</span>
                      <span className="tutorial-tile">E</span>
                    </div>
                    <p>
                      <strong>Green</strong> marks a letter in the correct
                      position.
                    </p>
                  </div>
                  <div className="tutorial-example">
                    <div className="tutorial-example-row" aria-hidden="true">
                      <span className="tutorial-tile">G</span>
                      <span className="tutorial-tile tutorial-tile--present">
                        A
                      </span>
                      <span className="tutorial-tile">M</span>
                      <span className="tutorial-tile">M</span>
                      <span className="tutorial-tile">A</span>
                    </div>
                    <p>
                      <strong>Yellow</strong> means the letter belongs
                      elsewhere.
                    </p>
                  </div>
                  <div className="tutorial-example">
                    <div className="tutorial-example-row" aria-hidden="true">
                      <span className="tutorial-tile">H</span>
                      <span className="tutorial-tile">O</span>
                      <span className="tutorial-tile tutorial-tile--absent">
                        R
                      </span>
                      <span className="tutorial-tile">S</span>
                      <span className="tutorial-tile">E</span>
                    </div>
                    <p>
                      <strong>Gray</strong> indicates the letter is not in the
                      word.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="tutorial-scoring">
                <p className="tutorial-lede">
                  Each correct-position letter earns the precision bonus from
                  its beacon, then your speed multiplier is applied.
                </p>
                <div className="score-callout">
                  <Star size={22} aria-hidden="true" />
                  <div>
                    <strong>Precision bonus: 0 to 50 points</strong>
                    <span>
                      Place your flag near a beacon center for the biggest
                      score.
                    </span>
                  </div>
                </div>
                <div className="speed-section">
                  <div className="speed-heading">
                    <Zap size={18} aria-hidden="true" />
                    <strong>Speed multiplier</strong>
                  </div>
                  <div className="speed-tiers">
                    <div className="speed-tier speed-tier--fast">
                      <b>2.0x</b>
                      <span>under 30 seconds</span>
                    </div>
                    <div className="speed-tier speed-tier--steady">
                      <b>1.5x</b>
                      <span>under 60 seconds</span>
                    </div>
                    <div className="speed-tier">
                      <b>1.0x</b>
                      <span>60 seconds and beyond</span>
                    </div>
                  </div>
                </div>
                <div className="tutorial-controls">
                  <div className="tutorial-controls-heading">
                    <span>Keyboard controls</span>
                  </div>
                  <div className="tutorial-control-row">
                    <span
                      className="tutorial-key-cluster"
                      aria-label="W A S D keys"
                    >
                      <kbd>W</kbd>
                      <kbd>A</kbd>
                      <kbd>S</kbd>
                      <kbd>D</kbd>
                    </span>
                    <span>Pan the map</span>
                  </div>
                  <div className="tutorial-control-row">
                    <kbd>Enter</kbd>
                    <span>Submit your trace</span>
                  </div>
                  <div className="tutorial-control-row">
                    <kbd>Backspace</kbd>
                    <span>Remove the last beacon</span>
                  </div>
                </div>
              </div>
            )}

            <div className="tutorial-footer">
              <button
                type="button"
                className="tutorial-page-button"
                onClick={() => setTutorialPage((page) => Math.max(0, page - 1))}
                disabled={tutorialPage === 0}
                aria-label="Previous tutorial page"
                title="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="tutorial-page-count">
                {tutorialPage + 1} / 2
              </span>
              <button
                type="button"
                className="tutorial-page-button"
                onClick={() => setTutorialPage((page) => Math.min(1, page + 1))}
                disabled={tutorialPage === 1}
                aria-label="Next tutorial page"
                title="Next page"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="btn btn-primary tutorial-start"
                onClick={() => setLaunchPhase("LAUNCHING")}
              >
                <Zap size={16} />
                Start Game
              </button>
            </div>
          </section>
        </div>
      )}

      {launchPhase === "LAUNCHING" && (
        <div className="launch-overlay" role="status" aria-live="polite">
          <div className="launch-signal">
            <Radio size={28} aria-hidden="true" />
            <p className="launch-kicker">GeoTrace uplink</p>
            <strong>Starting game</strong>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="settings-backdrop" role="presentation">
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-heading">
              <h2 id="settings-title">Settings</h2>
              <button
                type="button"
                className="settings-close"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-label">Appearance</p>
            </div>
          </section>
        </div>
      )}
      <Analytics />
    </div>
  );
}
