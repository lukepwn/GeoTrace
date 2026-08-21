import React, { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  Delete,
  MapPin,
  Send,
  RotateCcw,
  Star,
  Timer,
  Zap,
} from "lucide-react";
import WorldMap from "./components/WorldMap.jsx";
import {
  ALLOWED_GUESSES,
  MAX_GUESSES,
  ROUND_SECONDS,
  WORD_LENGTH,
  evaluateGuess,
  pickRandomSolution,
} from "./gameLogic";
import "./App.css";

function createInitialState() {
  return {
    solution: pickRandomSolution(),
    guesses: [],
    currentTrace: [],
    score: 0,
    timeLeft: ROUND_SECONDS,
    gameState: "PLAYING",
    statusMessage: "Trace beacons on the map to spell your guess.",
  };
}

function fireVictoryConfetti() {
  confetti({
    particleCount: 140,
    spread: 80,
    origin: { y: 0.6 },
    colors: ["#38bdf8", "#22c55e", "#eab308"],
  });
}

export default function App() {
  const [state, setState] = useState(createInitialState);
  const {
    solution,
    guesses,
    currentTrace,
    score,
    timeLeft,
    gameState,
    statusMessage,
  } = state;
  const statusTimeoutRef = useRef(null);

  // 60-second countdown; ends the round in a loss once it hits zero.
  useEffect(() => {
    if (gameState !== "PLAYING") return undefined;

    const intervalId = setInterval(() => {
      setState((prev) => {
        if (prev.gameState !== "PLAYING") return prev;
        const nextTime = prev.timeLeft - 1;
        if (nextTime <= 0) {
          return {
            ...prev,
            timeLeft: 0,
            gameState: "LOST",
            statusMessage: `Time's up! The word was ${prev.solution}.`,
          };
        }
        return { ...prev, timeLeft: nextTime };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [gameState]);

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
        (t) => t.beacon.char === beacon.char,
      );

      // Re-selecting an already-traced letter repositions its flag instead of adding a duplicate.
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
        };
      }

      const roundBonus = prev.currentTrace.reduce((sum, t) => sum + t.bonus, 0);
      const nextScore = prev.score + roundBonus;
      const statuses = evaluateGuess(guessWord, prev.solution);
      const evaluatedRow = { word: guessWord, statuses };
      const nextGuesses = [...prev.guesses, evaluatedRow];
      const isWin = statuses.every((s) => s === "correct");
      const isLastGuess = nextGuesses.length >= MAX_GUESSES;

      if (isWin) {
        return {
          ...prev,
          guesses: nextGuesses,
          currentTrace: [],
          score: nextScore,
          gameState: "WON",
          statusMessage: `Signal locked! +${roundBonus} bonus. The word was ${prev.solution}.`,
        };
      }

      if (isLastGuess) {
        return {
          ...prev,
          guesses: nextGuesses,
          currentTrace: [],
          score: nextScore,
          gameState: "LOST",
          statusMessage: `Out of guesses. The word was ${prev.solution}.`,
        };
      }

      return {
        ...prev,
        guesses: nextGuesses,
        currentTrace: [],
        score: nextScore,
        statusMessage: `+${roundBonus} bonus banked. Keep tracing.`,
      };
    });
  }, []);

  useEffect(() => {
    if (gameState === "WON") fireVictoryConfetti();
  }, [gameState]);

  const handleReset = useCallback(() => {
    setState(createInitialState());
  }, []);

  const multiplier =
    timeLeft > 40
      ? "2.0x"
      : timeLeft > 20
        ? "1.5x"
        : timeLeft > 0
          ? "1.0x"
          : "0x";

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
      <div className="map-area">
        <WorldMap
          currentTrace={currentTrace}
          onSelectLetter={handleSelectLetter}
          disabled={gameState !== "PLAYING"}
        />
      </div>

      <aside className="sidebar">
        <header className="hud">
          <div className="hud-title">
            <MapPin size={22} className="hud-icon" />
            <h1>GeoTrace</h1>
          </div>
          <div className="hud-badges">
            <div className="badge badge-score" title="Precision bonus score">
              <Star size={16} />
              <span>{score}</span>
            </div>
            <div className="badge badge-timer">
              <Timer size={16} />
              <span>{timeLeft}s</span>
            </div>
            <div className="badge badge-multiplier">
              <Zap size={16} />
              <span>{multiplier}</span>
            </div>
          </div>
        </header>

        <section className="deduction-grid" aria-label="Guess history">
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

        <p className="status-message">{statusMessage}</p>

        <section className="toolbar">
          <div className="trace-path">
            {Array.from({ length: WORD_LENGTH }).map((_, i) => (
              <span
                key={i}
                className={`trace-slot${currentTrace[i] ? " trace-slot--filled" : ""}`}
              >
                {currentTrace[i]?.beacon.char || ""}
                {currentTrace[i] && (
                  <em className="trace-slot-bonus">+{currentTrace[i].bonus}</em>
                )}
              </span>
            ))}
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBackspace}
              disabled={gameState !== "PLAYING" || currentTrace.length === 0}
            >
              <Delete size={16} />
              Backspace
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={
                gameState !== "PLAYING" || currentTrace.length !== WORD_LENGTH
              }
            >
              <Send size={16} />
              Submit Guess
            </button>
          </div>
        </section>

        {gameState !== "PLAYING" && (
          <section
            className={`end-panel end-panel--${gameState.toLowerCase()}`}
          >
            <h2>
              {gameState === "WON" ? "Signal Locked!" : "Transmission Lost"}
            </h2>
            <p>
              The word was <strong>{solution}</strong>.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleReset}
            >
              <RotateCcw size={16} />
              Play Again
            </button>
          </section>
        )}
      </aside>
    </div>
  );
}
