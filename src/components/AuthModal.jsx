import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ShieldCheck,
  UserCheck,
  Lock,
  Mail,
  User,
  X,
  Check,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  Radio,
} from "lucide-react";
import {
  signIn,
  signUp,
  checkCallsignAvailability,
  validateCallsignFormat,
} from "../services/authService";

export default function AuthModal({
  isOpen,
  onClose,
  initialTab = "signup",
  onAuthSuccess,
}) {
  const [tab, setTab] = useState(initialTab); // 'signup' | 'signin'

  // Sign Up Form fields
  const [callsign, setCallsign] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  // Sign In Form fields
  const [signinIdentifier, setSigninIdentifier] = useState("");
  const [signinPassword, setSigninPassword] = useState("");

  // Validation & async checking states
  const [callsignStatus, setCallsignStatus] = useState({
    checking: false,
    available: null,
    message: "",
  });
  const [passwordStatus, setPasswordStatus] = useState({
    valid: null,
    message: "",
  });
  const [emailError, setEmailError] = useState("");
  const [signinError, setSigninError] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const debounceTimeoutRef = useRef(null);
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setErrorMsg("");
      setSuccessMsg("");
      setSigninError("");
      setEmailError("");
      setLoading(false);
    }
  }, [isOpen, initialTab]);

  // Real-time callsign availability checker with 350ms debounce
  const checkCallsign = useCallback(async (name) => {
    const format = validateCallsignFormat(name);
    if (!format.valid) {
      setCallsignStatus({
        checking: false,
        available: false,
        message: format.error || "Invalid format",
      });
      return;
    }

    setCallsignStatus({
      checking: true,
      available: null,
      message: "Checking frequency availability...",
    });

    try {
      const res = await checkCallsignAvailability(name);
      setCallsignStatus({
        checking: false,
        available: res.available,
        message: res.available
          ? "Callsign available!"
          : res.reason || "Callsign is already claimed.",
      });
    } catch {
      setCallsignStatus({
        checking: false,
        available: true,
        message: "Callsign format valid.",
      });
    }
  }, []);

  const handleCallsignChange = (e) => {
    const val = e.target.value;
    setCallsign(val);
    setErrorMsg("");

    clearTimeout(debounceTimeoutRef.current);
    if (!val.trim()) {
      setCallsignStatus({ checking: false, available: null, message: "" });
      return;
    }

    debounceTimeoutRef.current = setTimeout(() => {
      checkCallsign(val);
    }, 350);
  };

  const handlePasswordChange = (e) => {
    const val = e.target.value;
    setPassword(val);
    setErrorMsg("");

    if (!val) {
      setPasswordStatus({ valid: null, message: "" });
    } else if (val.length < 6) {
      setPasswordStatus({
        valid: false,
        message: "Password must be at least 6 characters.",
      });
    } else {
      setPasswordStatus({
        valid: true,
        message: "Password strength accepted.",
      });
    }
  };

  const handleEmailChange = (e) => {
    const val = e.target.value;
    setEmail(val);
    setErrorMsg("");
    if (emailError) {
      if (!val.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) {
        setEmailError("");
      }
    }
  };

  const handleEmailBlur = (e) => {
    const val = e.target.value.trim();
    if (val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      setEmailError("Please enter a valid email format.");
    } else {
      setEmailError("");
    }
  };

  useEffect(() => {
    return () => clearTimeout(debounceTimeoutRef.current);
  }, []);

  const handleSignInSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSigninError("");

    if (!signinIdentifier.trim()) {
      setSigninError("Please enter your callsign or email.");
      return;
    }

    if (!signinPassword) {
      setSigninError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      const res = await signIn({
        identifier: signinIdentifier.trim(),
        password: signinPassword,
      });
      if (res.success) {
        setSuccessMsg(`Welcome back, ${res.profile.callsign}!`);
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.profile);
          onClose();
        }, 1000);
      } else {
        setSigninError(
          res.error || "Failed to sign in. Please verify your credentials.",
        );
      }
    } catch (err) {
      setSigninError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!callsign.trim()) {
      setCallsignStatus({
        checking: false,
        available: false,
        message: "Please choose a callsign.",
      });
      return;
    }

    const format = validateCallsignFormat(callsign);
    if (!format.valid) {
      setCallsignStatus({
        checking: false,
        available: false,
        message: format.error,
      });
      return;
    }

    if (callsignStatus.available === false) {
      return;
    }

    if (!password) {
      setPasswordStatus({
        valid: false,
        message: "Please enter a password.",
      });
      return;
    }

    if (password.length < 6) {
      setPasswordStatus({
        valid: false,
        message: "Password must be at least 6 characters long.",
      });
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError("Please enter a valid email address or leave it blank.");
      return;
    }

    setLoading(true);
    try {
      const res = await signUp({
        email: email.trim() || undefined,
        password,
        callsign: callsign.trim(),
      });
      if (res.success) {
        setSuccessMsg(`Account created! Welcome, ${res.profile.callsign}.`);
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.profile);
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.error || "Failed to create account.");
      }
    } catch (err) {
      setErrorMsg(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="auth-backdrop"
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
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        {/* Header */}
        <div className="auth-header">
          <div className="auth-header-left">
            <div className="auth-header-icon">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="auth-kicker">Player Account</p>
              <h2 id="auth-title">
                {tab === "signup" ? "Create Account" : "Sign In"}
              </h2>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab-btn${tab === "signup" ? " auth-tab-btn--active" : ""}`}
            onClick={() => {
              setTab("signup");
              setErrorMsg("");
              setSuccessMsg("");
            }}
          >
            <Sparkles size={15} />
            <span>Create Account</span>
          </button>
          <button
            type="button"
            className={`auth-tab-btn${tab === "signin" ? " auth-tab-btn--active" : ""}`}
            onClick={() => {
              setTab("signin");
              setErrorMsg("");
              setSuccessMsg("");
            }}
          >
            <UserCheck size={15} />
            <span>Sign In</span>
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="auth-alert auth-alert--error" role="alert">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="auth-alert auth-alert--success" role="status">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Sign Up Form */}
        {tab === "signup" ? (
          <form onSubmit={handleSignUpSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="auth-callsign" className="auth-label">
                Callsign
              </label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  id="auth-callsign"
                  type="text"
                  maxLength={16}
                  value={callsign}
                  onChange={handleCallsignChange}
                  placeholder="Choose a callsign (e.g. ShadowPin)"
                  className={`auth-input${
                    callsignStatus.available === true
                      ? " auth-input--valid"
                      : callsignStatus.available === false
                        ? " auth-input--invalid"
                        : ""
                  }`}
                />
                {callsignStatus.checking && (
                  <Loader2 size={16} className="auth-input-status-spin" />
                )}
                {!callsignStatus.checking &&
                  callsignStatus.available === true && (
                    <Check size={16} className="auth-input-status-check" />
                  )}
              </div>
              {callsignStatus.message && (
                <span
                  className={`auth-hint${
                    callsignStatus.available === true
                      ? " auth-hint--success"
                      : callsignStatus.available === false
                        ? " auth-hint--error"
                        : ""
                  }`}
                >
                  {callsignStatus.message}
                </span>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="auth-password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Create a password (min. 6 characters)"
                  className={`auth-input${
                    passwordStatus.valid === true
                      ? " auth-input--valid"
                      : passwordStatus.valid === false
                        ? " auth-input--invalid"
                        : ""
                  }`}
                />
                {passwordStatus.valid === true && (
                  <Check size={16} className="auth-input-status-check" />
                )}
              </div>
              {passwordStatus.message && (
                <span
                  className={`auth-hint${
                    passwordStatus.valid === true
                      ? " auth-hint--success"
                      : " auth-hint--error"
                  }`}
                >
                  {passwordStatus.message}
                </span>
              )}
            </div>

            <div className="auth-field">
              <label htmlFor="auth-email" className="auth-label">
                Email Address{" "}
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  (Optional)
                </span>
              </label>
              <div className="auth-input-wrap">
                <Mail size={16} className="auth-input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={handleEmailChange}
                  onBlur={handleEmailBlur}
                  placeholder="yourname@example.com (optional)"
                  className={`auth-input${emailError ? " auth-input--invalid" : ""}`}
                />
              </div>
              {emailError ? (
                <span className="auth-hint auth-hint--error">{emailError}</span>
              ) : (
                <span className="auth-hint">
                  Optional — used for account recovery & updates.
                </span>
              )}
            </div>

            <div className="auth-benefit-list">
              <div className="benefit-item">
                <Check size={14} />
                <span>Save your custom callsign and gameplay stats</span>
              </div>
              <div className="benefit-item">
                <Check size={14} />
                <span>Sync leaderboard ranks across all your devices</span>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading || callsignStatus.checking}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Creating account...</span>
                </>
              ) : (
                <>
                  <UserCheck size={16} />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* Sign In Form */
          <form onSubmit={handleSignInSubmit} className="auth-form" noValidate>
            <div className="auth-field">
              <label htmlFor="auth-signin-identifier" className="auth-label">
                Callsign or Email
              </label>
              <div className="auth-input-wrap">
                <User size={16} className="auth-input-icon" />
                <input
                  id="auth-signin-identifier"
                  type="text"
                  value={signinIdentifier}
                  onChange={(e) => {
                    setSigninIdentifier(e.target.value);
                    setSigninError("");
                  }}
                  placeholder="Enter your callsign or email"
                  className={`auth-input${signinError ? " auth-input--invalid" : ""}`}
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="auth-signin-password" className="auth-label">
                Password
              </label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-input-icon" />
                <input
                  id="auth-signin-password"
                  type="password"
                  value={signinPassword}
                  onChange={(e) => {
                    setSigninPassword(e.target.value);
                    setSigninError("");
                  }}
                  placeholder="Enter your password"
                  className={`auth-input${signinError ? " auth-input--invalid" : ""}`}
                />
              </div>
              {signinError && (
                <span className="auth-hint auth-hint--error">
                  {signinError}
                </span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <UserCheck size={16} />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
