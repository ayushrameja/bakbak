import { ArrowRight, Check } from "lucide-react";
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
      <div className="auth-page__glow auth-page__glow--one" />
      <div className="auth-page__glow auth-page__glow--two" />

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card__topline">
            <div className="brand-lockup">
              <BakbakMark className="brand-mark" />
              <span>bakbak</span>
            </div>
            <span className={`mode-badge mode-badge--${mode}`}>
              {mode === "mock" ? "Preview" : "Private"}
            </span>
          </div>
          <header>
            <h2>
              {mode === "mock"
                ? "Come see the room."
                : view === "join"
                  ? "Join the room."
                  : "Welcome back."}
            </h2>
            <p>
              {mode === "mock"
                ? "Apne log. Apni bakbak. Nothing leaves this device."
                : view === "join"
                  ? "Use the invite your friend sent. No public rooms, no nonsense."
                  : "Sign in and get back to the bakbak."}
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
                onClick={() => setView("sign-in")}
              >
                Sign in
              </button>
              <button
                className={view === "join" ? "active" : ""}
                type="button"
                onClick={() => setView("join")}
              >
                Use an invite
              </button>
            </div>
          ) : null}

          <form onSubmit={handleSubmit}>
            {mode === "live" && view === "join" ? (
              <label>
                <span>Display name</span>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="What your friends call you"
                  minLength={2}
                  maxLength={50}
                  required
                />
              </label>
            ) : null}
            {mode === "live" ? (
              <>
                <label>
                  <span>Email</span>
                  <input
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  <span>Password</span>
                  <input
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    type="password"
                    autoComplete={
                      view === "join" ? "new-password" : "current-password"
                    }
                    minLength={8}
                    required
                  />
                </label>
              </>
            ) : null}
            {mode === "live" && view === "join" ? (
              <label>
                <span>Invite code</span>
                <input
                  className="code-input"
                  value={inviteCode}
                  onChange={(event) =>
                    setInviteCode(event.target.value.toUpperCase())
                  }
                  placeholder="BK-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
                  autoComplete="off"
                  required
                />
              </label>
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
              <Check size={15} /> invite-only
            </span>
            <span>
              <Check size={15} /> no public discovery
            </span>
          </footer>
        </div>
      </section>
    </main>
  );
}
