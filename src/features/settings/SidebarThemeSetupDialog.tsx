import { useEffect, useRef, useState } from "react";
import { SidebarThemeEditor } from "./SidebarThemeEditor";
import type { SidebarThemePreferences } from "./sidebar-theme-preferences";

interface SidebarThemeSetupDialogProps {
  preferences: SidebarThemePreferences;
  onSave: (preferences: SidebarThemePreferences) => void;
  onSkip: () => void;
}

export function SidebarThemeSetupDialog({
  preferences,
  onSave,
  onSkip,
}: SidebarThemeSetupDialogProps) {
  const [draft, setDraft] = useState(() => structuredClone(preferences));
  const dialogRef = useRef<HTMLElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const onSkipRef = useRef(onSkip);

  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  useEffect(() => {
    const returnFocusTo =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    skipRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkipRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      returnFocusTo?.focus();
    };
  }, []);

  return (
    <div className="sidebar-theme-setup-backdrop">
      <section
        ref={dialogRef}
        className="sidebar-theme-setup"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sidebar-theme-setup-title"
      >
        <header>
          <span className="eyebrow">One quick setup</span>
          <h1 id="sidebar-theme-setup-title">Make the sidebar yours</h1>
          <p>Personal and Bakbak can each have their own look.</p>
        </header>
        <SidebarThemeEditor value={draft} onChange={setDraft} />
        <footer>
          <small>You can change this later in Settings.</small>
          <div>
            <button
              ref={skipRef}
              className="secondary-button"
              type="button"
              onClick={onSkip}
            >
              Skip
            </button>
            <button
              className="primary-button"
              type="button"
              onClick={() => onSave({ ...draft, onboardingComplete: true })}
            >
              Save themes
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
