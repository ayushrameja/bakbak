import type { CSSProperties } from "react";

const BAKBAK_LETTERS = [..."BAKBAK"];

export function LoadingScreen() {
  return (
    <main
      className="app-loading app-loading--animated"
      role="status"
      aria-label="Loading Bakbak"
    >
      <h1 className="app-loading__word" aria-hidden="true">
        {BAKBAK_LETTERS.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            style={{ "--letter-index": index } as CSSProperties}
          >
            {letter}
          </span>
        ))}
      </h1>
    </main>
  );
}
