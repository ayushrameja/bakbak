import { useEffect } from "react";

export const SCROLLBAR_IDLE_DELAY_MS = 650;

export function useAutoHideScrollbars(): void {
  useEffect(() => {
    const active = new Map<HTMLElement, number>();

    const markScrolling = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const target = event.target;
      target.classList.add("is-scrolling");
      const previous = active.get(target);
      if (previous !== undefined) window.clearTimeout(previous);
      const timeout = window.setTimeout(() => {
        target.classList.remove("is-scrolling");
        active.delete(target);
      }, SCROLLBAR_IDLE_DELAY_MS);
      active.set(target, timeout);
    };

    document.addEventListener("scroll", markScrolling, true);
    return () => {
      document.removeEventListener("scroll", markScrolling, true);
      active.forEach((timeout) => window.clearTimeout(timeout));
      active.forEach((_timeout, target) =>
        target.classList.remove("is-scrolling"),
      );
      active.clear();
    };
  }, []);
}
