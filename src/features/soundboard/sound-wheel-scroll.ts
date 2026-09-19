/** The held shortcut includes Shift, so desktop webviews can report a normal
 * mouse wheel on deltaX instead of deltaY. We need direction, not pixel distance:
 * a single line/page notch must work just as well as a high-resolution wheel. */
export class SoundWheelScroll {
  private lastTime = -Infinity;
  private lastDirection = 0;

  reset(): void {
    this.lastTime = -Infinity;
    this.lastDirection = 0;
  }

  step(event: Pick<WheelEvent, "deltaX" | "deltaY" | "timeStamp">): number {
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!Number.isFinite(delta) || delta === 0) return 0;
    const direction = delta < 0 ? 1 : -1;
    // Bound trackpad momentum/repeated wheel events, but allow an immediate
    // reversal so the user can undo a page change without waiting.
    if (
      direction === this.lastDirection &&
      event.timeStamp >= this.lastTime &&
      event.timeStamp - this.lastTime < 180
    )
      return 0;
    this.lastTime = event.timeStamp;
    this.lastDirection = direction;
    return direction;
  }
}
