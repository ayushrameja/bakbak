export function shouldDismissSoundboardForPointer(
  target: EventTarget | null,
  drawer: HTMLElement | null,
): boolean {
  if (!(target instanceof Element)) return false;
  return !(
    drawer?.contains(target) ||
    target.closest('[aria-controls="soundboard-drawer"]') ||
    target.closest('[data-overlay-owner="soundboard"]')
  );
}

export function shouldDismissSoundboardForEscape(
  key: string,
  ownedModalOpen: boolean,
): boolean {
  return key === "Escape" && !ownedModalOpen;
}
