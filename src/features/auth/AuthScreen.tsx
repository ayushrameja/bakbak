import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Headphones,
  LockKeyhole,
  Mail,
  MessageCircleMore,
  ShieldCheck,
  Ticket,
  UserRound,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { BakbakMark } from "../../components/BakbakMark";
import { signIn, signUpAndRedeemInvite } from "../../lib/auth-service";
import type { AppUser, DataMode } from "../../lib/types";

interface AuthScreenProps {
  mode: DataMode;
  configurationWarning: string | null;
  onAuthenticated: (user: AppUser) => void;
  onEnterMock: () => void;
}

type AuthView = "sign-in" | "join";

export function AuthScreen({
  mode,
  configurationWarning,
  onAuthenticated,
  onEnterMock,
}: AuthScreenProps) {
  const [view, setView] = useState<AuthView>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  function selectView(nextView: AuthView) {
    setView(nextView);
    setError(null);
    setPasswordVisible(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (mode === "mock") {
      onEnterMock();
      return;
    }

    setSubmitting(true);
    try {
      const user =
        view === "join"
          ? await signUpAndRedeemInvite({
              email,
              password,
              displayName,
              inviteCode,
            })
          : await signIn({ email, password });
      onAuthenticated(user);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Bakbak could not sign you in.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <aside className="auth-story">
          <div className="auth-story__topline">
            <div className="brand-lockup">
              <BakbakMark className="brand-mark" />
              <span>bakbak</span>
            </div>
            <span className="auth-story__private">
              <ShieldCheck size={15} /> Private by design
            </span>
          </div>

          <div className="auth-story__copy">
            <span className="auth-story__eyebrow">Your people. One room.</span>
            <h1>
              Come for the call.
              <span>Stay for the chaos.</span>
            </h1>
            <p>
              A private corner for conversations, questionable soundboard
              choices, and the people who already get the joke.
            </p>

            <ul className="auth-story__features" aria-label="Bakbak highlights">
              <li>
                <MessageCircleMore size={18} />
                <span>
                  <strong>Talk without the crowd</strong>
                  Invite-only rooms, built for your circle.
                </span>
              </li>
              <li>
                <Headphones size={18} />
                <span>
                  <strong>Drop in whenever</strong>
                  Voice, chat, clips, and zero meeting energy.
                </span>
              </li>
            </ul>
          </div>

          <div className="auth-story__room" aria-hidden="true">
            <div className="auth-story__room-status">
              <span className="auth-story__live-dot" />
              <strong>The room is yours</strong>
              <span>Invite only</span>
            </div>
            <div className="auth-story__room-people">
              <span>ba</span>
              <span>kb</span>
              <span>ak</span>
              <small>Bring your people</small>
            </div>
          </div>
        </aside>

        <div className="auth-card" data-view={view}>
          <div className="auth-card__mobile-brand">
            <div className="brand-lockup">
              <BakbakMark className="brand-mark" />
              <span>bakbak</span>
            </div>
          </div>

          <div className="auth-card__topline">
            <span className={`mode-badge mode-badge--${mode}`}>
              {mode === "mock" ? "Preview mode" : "Private room"}
            </span>
            <span className="auth-card__security">
              <LockKeyhole size={14} /> Secure access
            </span>
          </div>

          <header>
            <h2 id="auth-title">
              {mode === "mock"
                ? "Take a look around."
                : view === "join"
                  ? "Your invite is the key."
                  : "Good to have you back."}
            </h2>
            <p>
              {mode === "mock"
                ? "Explore the full room locally. Nothing leaves this device."
                : view === "join"
                  ? "Create your account with the code a friend sent you."
                  : "Sign in to pick up where the conversation left off."}
            </p>
          </header>

          {configurationWarning ? (
            <div className="inline-notice">{configurationWarning}</div>
          ) : null}

          {mode === "live" ? (
            <div
              className="auth-tabs"
              role="tablist"
              aria-label="Account action"
            >
              <button
                className={view === "sign-in" ? "active" : ""}
                type="button"
                role="tab"
                id="auth-tab-sign-in"
                aria-controls="auth-form"
                aria-selected={view === "sign-in"}
                onClick={() => selectView("sign-in")}
              >
                Sign in
              </button>
              <button
                className={view === "join" ? "active" : ""}
                type="button"
                role="tab"
                id="auth-tab-join"
                aria-controls="auth-form"
                aria-selected={view === "join"}
                onClick={() => selectView("join")}
              >
                Join with invite
              </button>
            </div>
          ) : null}

          <form
            id="auth-form"
            role={mode === "live" ? "tabpanel" : undefined}
            aria-labelledby={
              mode === "live"
                ? view === "join"
                  ? "auth-tab-join"
                  : "auth-tab-sign-in"
                : undefined
            }
            onSubmit={handleSubmit}
          >
            {mode === "live" && view === "join" ? (
              <div className="auth-field">
                <label htmlFor="auth-display-name">Display name</label>
                <div className="auth-input">
                  <UserRound size={18} aria-hidden="true" />
                  <input
                    id="auth-display-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="What your friends call you"
                    autoComplete="nickname"
                    minLength={2}
                    maxLength={50}
                    required
                  />
                </div>
              </div>
            ) : null}
            {mode === "live" ? (
              <>
                <div className="auth-field">
                  <label htmlFor="auth-email">Email address</label>
                  <div className="auth-input">
                    <Mail size={18} aria-hidden="true" />
                    <input
                      id="auth-email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      type="email"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>
                <div className="auth-field">
                  <label htmlFor="auth-password">Password</label>
                  <div className="auth-input auth-input--password">
                    <LockKeyhole size={18} aria-hidden="true" />
                    <input
                      id="auth-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="At least 8 characters"
                      type={passwordVisible ? "text" : "password"}
                      autoComplete={
                        view === "join" ? "new-password" : "current-password"
                      }
                      minLength={8}
                      required
                    />
                    <button
                      className="auth-password-toggle"
                      type="button"
                      aria-label={
                        passwordVisible ? "Hide password" : "Show password"
                      }
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? (
                        <EyeOff size={17} />
                      ) : (
                        <Eye size={17} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : null}
            {mode === "live" && view === "join" ? (
              <div className="auth-field">
                <label htmlFor="auth-invite-code">Invite code</label>
                <div className="auth-input">
                  <Ticket size={18} aria-hidden="true" />
                  <input
                    id="auth-invite-code"
                    className="code-input"
                    value={inviteCode}
                    onChange={(event) =>
                      setInviteCode(event.target.value.toUpperCase())
                    }
                    placeholder="BK-XXXX-XXXX-XXXX"
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
            ) : null}
            {error ? (
              <div className="form-error" role="alert">
                {error}
              </div>
            ) : null}
            <button
              className="primary-button primary-button--wide"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? "Opening the door…"
                : mode === "mock"
                  ? "Enter the preview"
                  : view === "join"
                    ? "Create account"
                    : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>

          <footer>
            <span>
              <Check size={15} /> Invite-only access
            </span>
            <span>
              <Check size={15} /> No public discovery
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
