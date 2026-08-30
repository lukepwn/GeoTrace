import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Analytics } from "@vercel/analytics/react";
import confetti from "canvas-confetti";
import {
  ArrowRight,
  BarChart2,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Delete,
  Flame,
  MapPin,
  Send,
  Settings,
  Share2,
  ShieldCheck,
  Star,
  Timer,
  Trophy,
  User,
  LogOut,
  X,
  Zap,
} from "lucide-react";
import WorldMap from "./components/WorldMap.jsx";
import LeaderboardModal from "./components/LeaderboardModal.jsx";
import StatsModal from "./components/StatsModal.jsx";
import AuthModal from "./components/AuthModal.jsx";
import PlayModal from "./components/PlayModal.jsx";
import {
  ALLOWED_GUESSES,
  MAX_GUESSES,
  WORD_LENGTH,
  evaluateGuess,
  generateBeacons,
} from "./gameLogic";
import {
  getDailyPuzzleInfo,
  getSavedDailyState,
  saveDailyState,
  recordGameResult,
  getTimeUntilNextPuzzle,
  getTodayDateKey,
  getPlayerProfile,
} from "./services/dailyGame";
import { submitDailyScore } from "./services/leaderboardService";
import { signOut, onAuthStateChange } from "./services/authService";
import { LEVELS, DEFAULT_LEVEL_ID, getLevelById } from "./config/levels";
import "./App.css";

// Rewards how fast each individual guess was submitted (not total game time),
// so a snappy guess late in the round still earns its multiplier.
function speedMultiplier(elapsedSeconds) {
  if (elapsedSeconds < 30) return 2;
  if (elapsedSeconds < 60) return 1.5;
  return 1;
}

// Score tiers are calibrated against realistic play data rather than the raw theoretical max
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

const LEVEL_STORAGE_KEY = "geotrace-selected-level";

export default function App() {
  const todayDateKey = useMemo(() => getTodayDateKey(), []);
  const dailyInfo = useMemo(
    () => getDailyPuzzleInfo(todayDateKey),
    [todayDateKey],
  );
  const { puzzleNumber, dateKey, solution: dailySolution } = dailyInfo;

  const [levelId, setLevelId] = useState(() => {
    try {
      return localStorage.getItem(LEVEL_STORAGE_KEY) || DEFAULT_LEVEL_ID;
    } catch {
      return DEFAULT_LEVEL_ID;
    }
  });

  const activeLevel = useMemo(() => getLevelById(levelId), [levelId]);
  const levelBeacons = useMemo(
    () => generateBeacons(activeLevel.regions, activeLevel.seed),
    [activeLevel],
  );

  // Initialize state from saved daily progress or start fresh daily puzzle for this level
  const [state, setState] = useState(() => {
    const initialLevel = (() => {
      try {
        return localStorage.getItem(LEVEL_STORAGE_KEY) || DEFAULT_LEVEL_ID;
      } catch {
        return DEFAULT_LEVEL_ID;
      }
    })();
    const levelInfo = getDailyPuzzleInfo(dateKey, initialLevel);
    const saved = getSavedDailyState(dateKey, initialLevel);
    if (saved) {
      return {
        solution: saved.solution || levelInfo.solution,
        guesses: saved.guesses || [],
        creditedBonusByChar: saved.creditedBonusByChar || {},
        currentTrace: saved.currentTrace || [],
        score: saved.score || 0,
        elapsedSeconds: saved.elapsedSeconds || 0,
        gameState: saved.gameState || "PLAYING",
        statusMessage:
          saved.statusMessage ||
          "Trace beacons on the map to spell your guess.",
        shakeId: 0,
      };
    }
    return {
      solution: levelInfo.solution,
      guesses: [],
      creditedBonusByChar: {},
      currentTrace: [],
      score: 0,
      elapsedSeconds: 0,
      gameState: "PLAYING",
      statusMessage: "Trace beacons on the map to spell your guess.",
      shakeId: 0,
    };
  });

  const [showPlayMenu, setShowPlayMenu] = useState(() => {
    try {
      const initialLevel =
        localStorage.getItem(LEVEL_STORAGE_KEY) || DEFAULT_LEVEL_ID;
      const saved = getSavedDailyState(dateKey, initialLevel);
      if (saved && (saved.gameState === "WON" || saved.gameState === "LOST")) {
        return false;
      }
      return true;
    } catch {
      return true;
    }
  });

  const [showTutorial, setShowTutorial] = useState(false);
  const [tutorialSource, setTutorialSource] = useState("play");
  const [showExploreHint, setShowExploreHint] = useState(true);
  const [tutorialPage, setTutorialPage] = useState(0);

  const [showSettings, setShowSettings] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [leaderboardOpenedFromSettings, setLeaderboardOpenedFromSettings] =
    useState(false);
  const [leaderboardOpenedFromPlay, setLeaderboardOpenedFromPlay] =
    useState(false);
  const [showStats, setShowStats] = useState(false);
  const [statsOpenedFromSettings, setStatsOpenedFromSettings] = useState(false);
  const [statsOpenedFromPlay, setStatsOpenedFromPlay] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalTab, setAuthModalTab] = useState("signup");
  const [authOpenedFromSettings, setAuthOpenedFromSettings] = useState(false);
  const [authOpenedFromLeaderboard, setAuthOpenedFromLeaderboard] =
    useState(false);
  const [authOpenedFromPlay, setAuthOpenedFromPlay] = useState(false);
  const [activeProfile, setActiveProfile] = useState(() => getPlayerProfile());
  const [countdown, setCountdown] = useState(
    () => getTimeUntilNextPuzzle().formatted,
  );

  const settingsBackdropMouseDownRef = useRef(false);
  const tutorialBackdropMouseDownRef = useRef(false);

  const isAnyModalOpen = Boolean(
    showPlayMenu ||
    showSettings ||
    showTutorial ||
    showLeaderboard ||
    showStats ||
    showAuthModal,
  );

  useEffect(() => {
    const { unsubscribe } = onAuthStateChange(() => {
      setActiveProfile(getPlayerProfile());
    });
    return () => unsubscribe();
  }, []);

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

  // Handlers for modal navigation with settings/play menu return support
  const handleOpenLeaderboard = useCallback(
    (fromSettings = false, fromPlay = false) => {
      if (fromSettings) {
        setShowSettings(false);
        setLeaderboardOpenedFromSettings(true);
        setLeaderboardOpenedFromPlay(false);
      } else if (fromPlay) {
        setShowPlayMenu(false);
        setLeaderboardOpenedFromPlay(true);
        setLeaderboardOpenedFromSettings(false);
      } else {
        setLeaderboardOpenedFromSettings(false);
        setLeaderboardOpenedFromPlay(false);
      }
      setShowLeaderboard(true);
    },
    [],
  );

  const handleCloseLeaderboard = useCallback(() => {
    setShowLeaderboard(false);
    if (leaderboardOpenedFromSettings) {
      setLeaderboardOpenedFromSettings(false);
      setShowSettings(true);
    } else if (leaderboardOpenedFromPlay) {
      setLeaderboardOpenedFromPlay(false);
      setShowPlayMenu(true);
    }
  }, [leaderboardOpenedFromSettings, leaderboardOpenedFromPlay]);

  const handleOpenStats = useCallback(
    (fromSettings = false, fromPlay = false) => {
      if (fromSettings) {
        setShowSettings(false);
        setStatsOpenedFromSettings(true);
        setStatsOpenedFromPlay(false);
      } else if (fromPlay) {
        setShowPlayMenu(false);
        setStatsOpenedFromPlay(true);
        setStatsOpenedFromSettings(false);
      } else {
        setStatsOpenedFromSettings(false);
        setStatsOpenedFromPlay(false);
      }
      setShowStats(true);
    },
    [],
  );

  const handleCloseStats = useCallback(() => {
    setShowStats(false);
    if (statsOpenedFromSettings) {
      setStatsOpenedFromSettings(false);
      setShowSettings(true);
    } else if (statsOpenedFromPlay) {
      setStatsOpenedFromPlay(false);
      setShowPlayMenu(true);
    }
  }, [statsOpenedFromSettings, statsOpenedFromPlay]);

  const handleOpenAuth = useCallback(
    (
      tab = "signup",
      fromSettings = false,
      fromLeaderboard = false,
      fromPlay = false,
    ) => {
      if (fromSettings) {
        setShowSettings(false);
        setAuthOpenedFromSettings(true);
      } else {
        setAuthOpenedFromSettings(false);
      }

      if (fromLeaderboard) {
        setShowLeaderboard(false);
        setAuthOpenedFromLeaderboard(true);
      } else {
        setAuthOpenedFromLeaderboard(false);
      }

      if (fromPlay) {
        setShowPlayMenu(false);
        setAuthOpenedFromPlay(true);
      } else {
        setAuthOpenedFromPlay(false);
      }

      setAuthModalTab(tab);
      setShowAuthModal(true);
    },
    [],
  );

  const handleCloseAuth = useCallback(() => {
    setShowAuthModal(false);
    setActiveProfile(getPlayerProfile());
    if (authOpenedFromSettings) {
      setAuthOpenedFromSettings(false);
      setShowSettings(true);
    } else if (authOpenedFromLeaderboard) {
      setAuthOpenedFromLeaderboard(false);
      setShowLeaderboard(true);
    } else if (authOpenedFromPlay) {
      setAuthOpenedFromPlay(false);
      setShowPlayMenu(true);
    }
  }, [authOpenedFromSettings, authOpenedFromLeaderboard, authOpenedFromPlay]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setActiveProfile(getPlayerProfile());
  }, []);

  // Countdown timer update
  useEffect(() => {
    const intervalId = setInterval(() => {
      setCountdown(getTimeUntilNextPuzzle().formatted);
    }, 1000);
    return () => clearInterval(intervalId);
  }, []);

  const handleSelectLevel = useCallback(
    (id) => {
      // 1. Save current level's state before switching
      saveDailyState(dateKey, state, levelId);

      // 2. Set new level
      setLevelId(id);
      try {
        localStorage.setItem(LEVEL_STORAGE_KEY, id);
      } catch {}

      // 3. Load or create state for the selected level
      const saved = getSavedDailyState(dateKey, id);
      if (saved) {
        setState({
          solution: saved.solution || getDailyPuzzleInfo(dateKey, id).solution,
          guesses: saved.guesses || [],
          creditedBonusByChar: saved.creditedBonusByChar || {},
          currentTrace: saved.currentTrace || [],
          score: saved.score || 0,
          elapsedSeconds: saved.elapsedSeconds || 0,
          gameState: saved.gameState || "PLAYING",
          statusMessage:
            saved.statusMessage ||
            "Trace beacons on the map to spell your guess.",
          shakeId: 0,
        });
      } else {
        const levelInfo = getDailyPuzzleInfo(dateKey, id);
        setState({
          solution: levelInfo.solution,
          guesses: [],
          creditedBonusByChar: {},
          currentTrace: [],
          score: 0,
          elapsedSeconds: 0,
          gameState: "PLAYING",
          statusMessage: "Trace beacons on the map to spell your guess.",
          shakeId: 0,
        });
      }
    },
    [dateKey, state, levelId],
  );

  const handleCloseTutorial = useCallback(() => {
    setShowTutorial(false);
    try {
      localStorage.setItem("geotrace_tutorial_seen", "true");
    } catch {}

    if (tutorialSource === "settings") {
      setShowSettings(true);
    } else if (tutorialSource === "play") {
      setShowPlayMenu(true);
    } else {
      // Direct / first-time onboarding -> start playing immediately!
      setShowPlayMenu(false);
      setShowSettings(false);
    }
  }, [tutorialSource]);

  const handleOpenTutorial = useCallback((source = "settings") => {
    if (source === "settings") {
      setShowSettings(false);
    } else if (source === "play") {
      setShowPlayMenu(false);
    }
    setTutorialSource(source);
    setTutorialPage(0);
    setShowTutorial(true);
  }, []);

  // Stopwatch counts up while playing; automatically saved to prevent reset abuse
  useEffect(() => {
    if (gameState !== "PLAYING" || isAnyModalOpen) return undefined;

    const intervalId = setInterval(() => {
      setState((prev) => {
        if (prev.gameState !== "PLAYING") return prev;
        const nextTime = prev.elapsedSeconds + 1;
        if (nextTime % 5 === 0) {
          saveDailyState(
            dateKey,
            { ...prev, elapsedSeconds: nextTime },
            levelId,
          );
        }
        return { ...prev, elapsedSeconds: nextTime };
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [gameState, isAnyModalOpen, dateKey, levelId]);

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

  // Backspace deletes the last traced beacon
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInput =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      if (event.key !== "Backspace") return;
      if (gameState !== "PLAYING" || isAnyModalOpen) return;
      event.preventDefault();
      handleBackspace();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, isAnyModalOpen, handleBackspace]);

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

      let nextGameState = "PLAYING";
      let nextStatusMessage = `${bonusVerb}${roundBonus} bonus banked. Keep tracing.`;

      if (isWin) {
        nextGameState = "WON";
        nextStatusMessage = `Signal locked! ${bonusVerb}${roundBonus} bonus. The word was ${prev.solution}.`;
      } else if (isLastGuess) {
        nextGameState = "LOST";
        nextStatusMessage = `Out of guesses. The word was ${prev.solution}.`;
      }

      const nextState = {
        ...prev,
        guesses: nextGuesses,
        creditedBonusByChar: nextCreditedBonusByChar,
        currentTrace: [],
        score: nextScore,
        gameState: nextGameState,
        statusMessage: nextStatusMessage,
        shakeId: isWin ? prev.shakeId : prev.shakeId + 1,
      };

      // Persist state
      saveDailyState(dateKey, nextState, levelId);

      // If game concludes, update streaks and submit to leaderboard
      if (isWin || isLastGuess) {
        recordGameResult(dateKey, isWin, nextGuesses.length, nextScore);
        submitDailyScore({
          dateKey,
          levelId,
          puzzleNumber,
          score: nextScore,
          guessesCount: nextGuesses.length,
          timeSeconds: prev.elapsedSeconds,
          tier: getScoreTier(nextScore).tier,
          gameState: nextGameState,
        });
      }

      return nextState;
    });
  }, [dateKey, puzzleNumber, levelId]);

  // Enter submits the current trace
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isInput =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      if (event.key !== "Enter") return;
      if (gameState !== "PLAYING" || isAnyModalOpen) return;
      event.preventDefault();
      handleSubmit();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameState, isAnyModalOpen, handleSubmit]);

  // Escape closes open modals
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (showAuthModal) {
        event.preventDefault();
        handleCloseAuth();
      } else if (showTutorial) {
        event.preventDefault();
        handleCloseTutorial();
      } else if (showLeaderboard) {
        event.preventDefault();
        handleCloseLeaderboard();
      } else if (showStats) {
        event.preventDefault();
        handleCloseStats();
      } else if (showSettings) {
        event.preventDefault();
        setShowSettings(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    showAuthModal,
    showTutorial,
    showSettings,
    showLeaderboard,
    showStats,
    handleCloseAuth,
    handleCloseTutorial,
    handleCloseLeaderboard,
    handleCloseStats,
  ]);

  useEffect(() => {
    if (gameState === "WON") fireVictoryConfetti();
  }, [gameState]);

  const [shareCopied, setShareCopied] = useState(false);

  // Directly copy formatted text to clipboard without external share sheets
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
    const guessResult =
      gameState === "WON"
        ? `${guesses.length}/${MAX_GUESSES}`
        : `X/${MAX_GUESSES}`;
    const shareTitle = `GeoTrace #${puzzleNumber} (${activeLevel.name}) ${guessResult}`;
    const shareLink = "https://geotrace.bytemapstudio.com";
    const shareText = `${shareTitle}\n${score} pts (${scoreTier.tier} Tier ${scoreTier.label.toUpperCase()})\n\n${emojiRows}\n\n${shareLink}`;

    const copyText = (text) => {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      return new Promise((resolve, reject) => {
        document.execCommand("copy") ? resolve() : reject();
        textArea.remove();
      });
    };

    copyText(shareText)
      .then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
      })
      .catch((err) => {
        console.error("Failed to copy:", err);
      });
  }, [guesses, score, gameState, puzzleNumber]);

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
      {/* Top Corner Action Controls (Always Visible) */}
      <div className="top-corner-actions">
        <button
          type="button"
          className="icon-action-button"
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>

      <div
        className="map-area"
        style={{ background: activeLevel.theme.oceanBg }}
      >
        <WorldMap
          currentTrace={currentTrace}
          onSelectLetter={handleSelectLetter}
          onNavigate={() => setShowExploreHint(false)}
          disabled={gameState !== "PLAYING" || isAnyModalOpen}
          level={activeLevel}
          beacons={levelBeacons}
        />
        <div className="map-timer" title="Elapsed time">
          <Timer size={20} />
          <span>{formatStopwatch(elapsedSeconds)}</span>
        </div>
        {gameState === "PLAYING" && showExploreHint && (
          <div className="explore-hint" role="status">
            <MapPin size={16} aria-hidden="true" />
            Pan and zoom to locate beacons
          </div>
        )}

        <div className="right-dock">
          <header className="hud-float">
            <div className="hud-title-wrap">
              <div className="hud-title">
                <MapPin size={20} className="hud-icon" />
                <h1>GeoTrace</h1>
              </div>
              <span className="hud-puzzle-pill">#{puzzleNumber}</span>
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
                  gameState !== "PLAYING" ||
                  isAnyModalOpen ||
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
                  gameState !== "PLAYING" ||
                  isAnyModalOpen ||
                  currentTrace.length !== WORD_LENGTH
                }
              >
                <Send size={16} />
                Submit Guess
              </button>
              <span className="solution">{solution}</span>
            </div>
          </section>
        </div>

        {gameState !== "PLAYING" && (
          <div className="end-overlay">
            <section
              className={`end-panel end-panel--${gameState.toLowerCase()}`}
            >
              <div className="end-panel-badge-top">
                GeoTrace #{puzzleNumber} &bull; Daily Challenge
              </div>
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

              <div className="end-panel-stats-summary">
                <div className="end-stat-box">
                  <span className="end-stat-label">Score</span>
                  <strong className="end-stat-value">
                    <Star size={14} /> {score}
                  </strong>
                </div>
                <div className="end-stat-box">
                  <span className="end-stat-label">Guesses</span>
                  <strong className="end-stat-value">
                    {gameState === "WON" ? guesses.length : "X"}/{MAX_GUESSES}
                  </strong>
                </div>
                <div className="end-stat-box">
                  <span className="end-stat-label">Time</span>
                  <strong className="end-stat-value">
                    {formatStopwatch(elapsedSeconds)}
                  </strong>
                </div>
              </div>

              <div className="end-panel-countdown">
                <span className="countdown-sub">NEXT SIGNAL IN</span>
                <strong className="countdown-time">
                  <Clock size={16} /> {countdown}
                </strong>
              </div>

              <div className="end-panel-actions">
                <button
                  type="button"
                  className="btn btn-primary end-btn-share"
                  onClick={handleShare}
                >
                  <Share2 size={16} />
                  {shareCopied ? "Copied to Clipboard!" : "Share Result"}
                </button>
                <div className="end-panel-actions-sub">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenLeaderboard(false)}
                  >
                    <Trophy size={16} />
                    Leaderboard
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleOpenStats(false)}
                  >
                    <BarChart2 size={16} />
                    Career Stats
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>

      {showTutorial && (
        <div
          className="tutorial-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            tutorialBackdropMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (
              tutorialBackdropMouseDownRef.current &&
              e.target === e.currentTarget
            ) {
              handleCloseTutorial();
            }
            tutorialBackdropMouseDownRef.current = false;
          }}
        >
          <section
            className="tutorial-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tutorial-title"
          >
            <div className="tutorial-heading">
              <div className="tutorial-heading-left">
                <div className="tutorial-header-icon">
                  <BookOpen size={22} />
                </div>
                <div>
                  <p className="tutorial-kicker">Operator Briefing</p>
                  <h2 id="tutorial-title">
                    {tutorialPage === 0 ? "How to Play" : "Score the Signal"}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                className="tutorial-close modal-close-btn"
                onClick={handleCloseTutorial}
                aria-label="Close tutorial"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            {tutorialPage === 0 ? (
              <>
                <p className="tutorial-lede">
                  Trace five beacons on the map to decode today's daily signal
                  in six guesses. One challenge per day!
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
                onClick={handleCloseTutorial}
              >
                {tutorialSource === "settings" ? (
                  <>
                    <ChevronLeft size={16} />
                    <span>Back to Settings</span>
                  </>
                ) : tutorialSource === "play" ? (
                  <>
                    <ChevronLeft size={16} />
                    <span>Back to Mission</span>
                  </>
                ) : (
                  <>
                    <span>Engage Daily Signal</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      )}

      {showSettings && (
        <div
          className="settings-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            settingsBackdropMouseDownRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (
              settingsBackdropMouseDownRef.current &&
              e.target === e.currentTarget
            ) {
              setShowSettings(false);
            }
            settingsBackdropMouseDownRef.current = false;
          }}
        >
          <section
            className="settings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-heading">
              <div className="settings-heading-left">
                <div className="settings-header-icon">
                  <Settings size={22} />
                </div>
                <div>
                  <p className="settings-kicker">System Configuration</p>
                  <h2 id="settings-title">Settings</h2>
                </div>
              </div>
              <button
                type="button"
                className="settings-close modal-close-btn"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-label">Operator Account</p>
              {activeProfile.isRegistered ? (
                <div className="account-status-card">
                  <div className="settings-card-left">
                    <div
                      className="settings-card-icon"
                      style={{ color: "#4ade80" }}
                    >
                      <ShieldCheck size={18} />
                    </div>
                    <div className="settings-card-info">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span className="settings-card-name">
                          {activeProfile.callsign}
                        </span>
                        <span className="verified-badge">Verified</span>
                      </div>
                      <span className="settings-card-subtitle">
                        {activeProfile.email || "Account Active"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="account-signout-btn"
                    onClick={handleSignOut}
                    title="Sign Out"
                  >
                    <LogOut size={13} />
                    <span>Sign Out</span>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="settings-card"
                  onClick={() => handleOpenAuth("signup", true, false, false)}
                >
                  <div className="settings-card-left">
                    <div className="settings-card-icon">
                      <User size={18} />
                    </div>
                    <div className="settings-card-info">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <span className="settings-card-name">
                          {activeProfile.callsign}
                        </span>
                        <span className="guest-badge">Guest</span>
                      </div>
                      <span className="settings-card-subtitle">
                        Sign in to claim & reserve your unique callsign
                      </span>
                    </div>
                  </div>
                  <span className="settings-card-badge">Sign In</span>
                </button>
              )}
            </div>

            <div className="settings-section">
              <p className="settings-label">Tutorial</p>
              <button
                type="button"
                className="settings-card"
                onClick={() => handleOpenTutorial("settings")}
              >
                <div className="settings-card-left">
                  <div className="settings-card-icon">
                    <BookOpen size={18} />
                  </div>
                  <div className="settings-card-info">
                    <span className="settings-card-name">How to Play</span>
                    <span className="settings-card-subtitle">
                      Rules, scoring mechanics & controls
                    </span>
                  </div>
                </div>
                <span className="settings-card-badge">View</span>
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-label">Records & Standings</p>
              <button
                type="button"
                className="settings-card"
                onClick={() => handleOpenLeaderboard(true, false)}
              >
                <div className="settings-card-left">
                  <div className="settings-card-icon">
                    <Trophy size={18} />
                  </div>
                  <div className="settings-card-info">
                    <span className="settings-card-name">
                      Daily Leaderboard
                    </span>
                    <span className="settings-card-subtitle">
                      View today's top global scores
                    </span>
                  </div>
                </div>
                <span className="settings-card-badge">Open</span>
              </button>
              <button
                type="button"
                className="settings-card"
                style={{ marginTop: 8 }}
                onClick={() => handleOpenStats(true, false)}
              >
                <div className="settings-card-left">
                  <div className="settings-card-icon">
                    <BarChart2 size={18} />
                  </div>
                  <div className="settings-card-info">
                    <span className="settings-card-name">
                      Career Statistics
                    </span>
                    <span className="settings-card-subtitle">
                      Streaks, win rates & guess distribution
                    </span>
                  </div>
                </div>
                <span className="settings-card-badge">Open</span>
              </button>
            </div>

            <div className="settings-section">
              <p className="settings-label">Map Theme</p>
              <div className="level-select-grid">
                {LEVELS.map((lvl) => {
                  const isActive = lvl.id === levelId;
                  return (
                    <button
                      key={lvl.id}
                      type="button"
                      className={`level-card${isActive ? " level-card--active" : ""}`}
                      style={{
                        "--level-card-accent": lvl.theme.accentColor,
                        "--level-card-glow": lvl.theme.panningGlow,
                      }}
                      onClick={() => handleSelectLevel(lvl.id)}
                    >
                      <div className="level-card-left">
                        <div className="level-card-icon">
                          {lvl.id === "leveltwo" ? (
                            <Flame size={18} />
                          ) : (
                            <Compass size={18} />
                          )}
                        </div>
                        <div className="level-card-info">
                          <span className="level-card-name">{lvl.name}</span>
                          <span className="level-card-subtitle">
                            {lvl.subtitle}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`level-card-badge${isActive ? " level-card-badge--active" : ""}`}
                      >
                        {isActive ? "Active" : "Select"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Daily Mission Briefing / Play Modal */}
      <PlayModal
        isOpen={showPlayMenu}
        onPlay={() => setShowPlayMenu(false)}
        puzzleNumber={puzzleNumber}
        dateKey={dateKey}
        levelId={levelId}
        activeLevel={activeLevel}
        onSelectLevel={handleSelectLevel}
        profile={activeProfile}
        gameState={gameState}
        guessesCount={guesses.length}
        score={score}
        countdown={countdown}
        onOpenTutorial={() => handleOpenTutorial("play")}
        onOpenLeaderboard={() => handleOpenLeaderboard(false, true)}
        onOpenStats={() => handleOpenStats(false, true)}
        onOpenAuth={(tab) => handleOpenAuth(tab, false, false, true)}
      />

      {/* Leaderboard Modal */}
      <LeaderboardModal
        isOpen={showLeaderboard}
        onClose={handleCloseLeaderboard}
        dateKey={dateKey}
        puzzleNumber={puzzleNumber}
        levelId={levelId}
        levelName={activeLevel.name}
        isOpenedFromSettings={leaderboardOpenedFromSettings}
        onOpenAuth={(tab) => handleOpenAuth(tab, false, true, false)}
      />

      {/* Stats Modal */}
      <StatsModal
        isOpen={showStats}
        onClose={handleCloseStats}
        isOpenedFromSettings={statsOpenedFromSettings}
      />

      {/* Operator Authentication Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={handleCloseAuth}
        initialTab={authModalTab}
        onAuthSuccess={(p) => setActiveProfile(p)}
      />

      <Analytics />
    </div>
  );
}
