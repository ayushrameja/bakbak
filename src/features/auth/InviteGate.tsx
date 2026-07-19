import {
  ArrowLeft,
  ArrowRight,
  KeyRound,
  LogOut,
  MessageCircle,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { getSupabaseClient } from "../../lib/supabase";
import type { AppUser } from "../../lib/types";
import { validateInviteCode } from "./invite";

interface InviteGateProps {
  user: AppUser;
  onRedeemed: () => void;
  onSignOut: () => void;
  onBack?: (() => void) | undefined;
}

export function InviteGate({
  user,
  onRedeemed,
  onSignOut,
  onBack,
}: InviteGateProps) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validation = validateInviteCode(code);
    if (!validation.ok) {
      setError("That invite code does not look complete yet.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: inviteError } = await getSupabaseClient().rpc(
      "redeem_invite_code",
      { p_code: validation.code },
    );
    setSubmitting(false);
    if (inviteError) {
      setError("That invite is invalid, expired, or already used.");
      return;
    }
    onRedeemed();
  }

  return (
    <main className="invite-gate">
      <section>
        <span className="brand-mark">
          <MessageCircle size={24} />
        </span>
        <div className="invite-gate__icon">
          <KeyRound size={25} />
        </div>
        <span className="eyebrow">One last thing</span>
        <h1>
          You are signed in.
          <br />
          Now find your room.
        </h1>
        <p>
          Hey {user.displayName}. Paste the single-use invite from your friend.
          Bakbak cannot list private servers—being nosy is not a feature.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            <span>Invite code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="BK-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX"
              autoFocus
              autoComplete="off"
              required
            />
          </label>
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
            {submitting ? "Checking the guest list…" : "Join the room"}
            <ArrowRight size={18} />
          </button>
        </form>
        <button
          className="text-button invite-gate__signout"
          type="button"
          onClick={onSignOut}
        >
          <LogOut size={14} /> Sign in with another account
        </button>
        {onBack ? (
          <button
            className="text-button invite-gate__signout"
            type="button"
            onClick={onBack}
          >
            <ArrowLeft size={14} /> Back to Personal
          </button>
        ) : null}
      </section>
    </main>
  );
}
