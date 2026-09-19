import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { BakbakMark } from "./BakbakMark";

interface RuntimeResetRecoveryProps {
  onRetry: () => Promise<void>;
}

export function RuntimeResetRecovery({ onRetry }: RuntimeResetRecoveryProps) {
  const [retrying, setRetrying] = useState(false);

  return (
    <main className="runtime-reset-recovery">
      <section aria-labelledby="runtime-reset-title">
        <BakbakMark className="runtime-reset-recovery__mark" />
        <p className="eyebrow">Bakbak 2.0 setup</p>
        <h1 id="runtime-reset-title">Bakbak could not finish local cleanup</h1>
        <p>
          Quit every other Bakbak window and retry. If cleanup still fails,
          restart Bakbak. This removes only old local drafts, cache, layout,
          device preferences, and sign-in data; your cloud messages, profile,
          favorites, and servers stay safe.
        </p>
        <button
          className="primary-button"
          type="button"
          disabled={retrying}
          onClick={() => {
            setRetrying(true);
            void onRetry().catch(() => setRetrying(false));
          }}
        >
          <RotateCcw size={15} />
          {retrying ? "Retrying…" : "Retry cleanup"}
        </button>
      </section>
    </main>
  );
}
