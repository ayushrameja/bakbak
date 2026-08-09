import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
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
          <div className="brand-lockup">
            <BakbakMark className="brand-mark" />
            <span>bakbak</span>
          </div>

          <div className="auth-story__summary">
            <span>Private space</span>
            <p>Made for your people.</p>
          </div>

          <span className="auth-story__private">
            <ShieldCheck size={15} /> Invite only
          </span>
        </aside>

        <div className="auth-card" data-view={view}>
          <div className="auth-card__mobile-brand">
            <div className="brand-lockup">
              <BakbakMark className="brand-mark" />
              <span>bakbak</span>
            </div>
          </div>

          <div className="auth-card__body">
            <span className={`mode-badge mode-badge--${mode}`}>
              {mode === "mock" ? "Preview" : "Private"}
            </span>

            <header>
              <h2 id="auth-title">
                {mode === "mock"
                  ? "Take a look around"
                  : view === "join"
                    ? "Join Bakbak"
                    : "Welcome back"}
              </h2>
              <p>
                {mode === "mock"
                  ? "Explore locally without an account."
                  : view === "join"
                    ? "Use the invite a friend sent you."
                    : "Sign in to continue."}
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
                  Use an invite
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
                        onClick={() =>
                          setPasswordVisible((visible) => !visible)
                        }
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
          </div>
        </div>
      </section>
    </main>
  );
}
