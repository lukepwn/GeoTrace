import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Bug,
  MapPin,
  Sparkles,
  Send,
  CheckCircle2,
  X,
  Radio,
  Loader2,
  AlertCircle,
  ShieldCheck,
  User,
  Info,
} from "lucide-react";
import { submitPlayerFeedback } from "../services/feedbackService";

const CATEGORIES = [
  {
    id: "general",
    label: "General Feedback",
    icon: MessageSquare,
    desc: "Thoughts, impressions, or overall game feedback",
    placeholder:
      "Share your thoughts, impressions, or recommendations for GeoTrace...",
  },
  {
    id: "puzzle_issue",
    label: "Puzzle & Map Issue",
    icon: MapPin,
    desc: "Beacon locations, word clarity, or coordinate balance",
    placeholder:
      "Tell us about beacon placements, coordinate visibility, letter clarity, or word validity...",
  },
  {
    id: "bug",
    label: "Bug or Glitch",
    icon: Bug,
    desc: "Technical bugs, visual glitches, or unexpected behavior",
    placeholder:
      "Describe what happened, any error messages, and what you were doing when it occurred...",
  },
  {
    id: "suggestion",
    label: "Feature Request",
    icon: Sparkles,
    desc: "Ideas for new features, game modes, or map sectors",
    placeholder:
      "What new features, settings, sectors, or gameplay modes would you love to see?",
  },
];

export default function FeedbackModal({
  isOpen,
  onClose,
  initialCategory = "general",
  profile = null,
  puzzleNumber = null,
  levelId = "levelone",
  levelName = "Sector 1",
  gameState = "PLAYING",
  elapsedSeconds = 0,
  guessesCount = 0,
}) {
  const [category, setCategory] = useState(initialCategory);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const backdropMouseDownRef = useRef(false);
  const textareaRef = useRef(null);

  // Sync initial category and reset state when opening
  useEffect(() => {
    if (isOpen) {
      setCategory(initialCategory || "general");
      setMessage("");
      setEmail(profile?.email || "");
      setErrorMsg("");
      setIsSuccess(false);
      setSubmitting(false);

      // Focus textarea after render
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, initialCategory, profile]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentCatConfig =
    CATEGORIES.find((c) => c.id === category) || CATEGORIES[0];

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitting) return;

    if (!message.trim()) {
      setErrorMsg("Please enter your feedback message before sending.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const result = await submitPlayerFeedback({
        category,
        message: message.trim(),
        email: email.trim(),
        profile,
        puzzleNumber,
        levelId,
        gameState,
        elapsedSeconds,
        guessesCount,
      });

      if (result.success) {
        setIsSuccess(true);
      } else {
        setErrorMsg(
          result.error || "Failed to submit feedback. Please try again.",
        );
      }
    } catch (err) {
      console.error("Feedback submit error:", err);
      setErrorMsg("An unexpected error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDownTextarea = (e) => {
    // Ctrl+Enter or Cmd+Enter to submit
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="feedback-backdrop"
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
        className="feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        {/* Header */}
        <div className="feedback-heading">
          <div className="feedback-heading-left">
            <div className="feedback-header-icon">
              <Radio size={22} />
            </div>
            <div>
              <div className="feedback-kicker-row">
                <span className="live-pulse-dot" />
                <p className="feedback-kicker">Operator Dispatch</p>
                {puzzleNumber && (
                  <span className="feedback-puzzle-badge">
                    Puzzle #{puzzleNumber}
                  </span>
                )}
              </div>
              <h2 id="feedback-title">Transmission Feedback</h2>
            </div>
          </div>
          <button
            type="button"
            className="feedback-close modal-close-btn"
            onClick={onClose}
            aria-label="Close feedback"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {isSuccess ? (
          /* Success Screen */
          <div className="feedback-success-state">
            <div className="feedback-success-icon-wrap">
              <CheckCircle2 size={44} className="feedback-success-icon" />
            </div>
            <h3>Signal Received!</h3>
            <p className="feedback-success-text">
              Thank you for helping improve GeoTrace. Your transmission report
              has been recorded and routed to mission command.
            </p>
            <div className="feedback-success-actions">
              <button
                type="button"
                className="btn btn-primary feedback-done-btn"
                onClick={onClose}
              >
                Back to Game
              </button>
              <button
                type="button"
                className="feedback-send-another-btn"
                onClick={() => {
                  setIsSuccess(false);
                  setMessage("");
                  setErrorMsg("");
                }}
              >
                Submit Additional Feedback
              </button>
            </div>
          </div>
        ) : (
          /* Feedback Form */
          <form className="feedback-form" onSubmit={handleSubmit}>
            {/* Category Selector */}
            <div className="feedback-section">
              <label className="feedback-label">Report Category</label>
              <div className="feedback-category-grid">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`feedback-category-card${isActive ? " feedback-category-card--active" : ""}`}
                      onClick={() => {
                        setCategory(cat.id);
                        setErrorMsg("");
                      }}
                    >
                      <div className="feedback-category-icon">
                        <Icon size={16} />
                      </div>
                      <div className="feedback-category-info">
                        <span className="feedback-category-name">
                          {cat.label}
                        </span>
                        <span className="feedback-category-desc">
                          {cat.desc}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Area */}
            <div className="feedback-section">
              <div className="feedback-label-row">
                <label htmlFor="feedback-message" className="feedback-label">
                  Message Details
                </label>
                <span
                  className={`feedback-char-count${message.length > 1400 ? " feedback-char-count--warn" : ""}`}
                >
                  {message.length} / 1500
                </span>
              </div>
              <textarea
                id="feedback-message"
                ref={textareaRef}
                className="feedback-textarea"
                rows={4}
                maxLength={1500}
                placeholder={currentCatConfig.placeholder}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDownTextarea}
                disabled={submitting}
              />
            </div>

            {/* Contact Email Field */}
            <div className="feedback-section feedback-email-section">
              <div className="feedback-label-row">
                <label htmlFor="feedback-email" className="feedback-label">
                  Contact Email{" "}
                  <span className="feedback-optional">(Optional)</span>
                </label>
                {profile?.isRegistered && profile?.email && (
                  <span className="feedback-verified-pill">
                    <ShieldCheck size={12} />
                    Verified Operator
                  </span>
                )}
              </div>
              <input
                id="feedback-email"
                type="email"
                className="feedback-input"
                placeholder="operator@domain.com (if you'd like a response)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Auto-Attached Diagnostics Context Pill */}
            <div className="feedback-diagnostics-bar">
              <div className="feedback-diagnostics-header">
                <Info size={13} />
                <span>Auto-Attached Mission Telemetry:</span>
              </div>
              <div className="feedback-diagnostics-tags">
                <span className="feedback-tag">
                  Puzzle #{puzzleNumber || "N/A"}
                </span>
                <span className="feedback-tag">{levelName}</span>
                <span className="feedback-tag">
                  {profile?.callsign || "Guest"}
                </span>
                <span className="feedback-tag">Status: {gameState}</span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="feedback-error-banner" role="alert">
                <AlertCircle size={15} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Actions */}
            <div className="feedback-actions">
              <button
                type="button"
                className="btn btn-secondary feedback-cancel-btn"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary feedback-submit-btn"
                disabled={submitting || !message.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="btn-spinner" />
                    <span>Transmitting...</span>
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    <span>Send Feedback</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
