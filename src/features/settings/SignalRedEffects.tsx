import { useEffect, useRef, useState } from "react";
import {
  communicationEffectLabel,
  type CommunicationEffectEvent,
} from "../../lib/communication-effects";
import { useReducedMotion } from "../../lib/use-reduced-motion";
import {
  nextSignalAmbientDelay,
  nextSignalStampDuration,
  SIGNAL_SAFE_STAMP_POSITIONS,
  type SignalStampPosition,
} from "./signal-red-scheduler";

interface SignalRedEffectsProps {
  active: boolean;
  paused: boolean;
  effect: {
    event: CommunicationEffectEvent;
    sequence: number;
  } | null;
  random?: () => number;
}

export function SignalRedEffects({
  active,
  paused,
  effect,
  random = Math.random,
}: SignalRedEffectsProps) {
  const reducedMotion = useReducedMotion();
  const [documentHidden, setDocumentHidden] = useState(
    () => typeof document !== "undefined" && document.hidden,
  );
  const [stamp, setStamp] = useState<{
    position: SignalStampPosition;
    sequence: number;
  } | null>(null);
  const [visibleEffect, setVisibleEffect] = useState(effect);
  const [ambientCycle, setAmbientCycle] = useState(0);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const handleVisibility = () => setDocumentHidden(document.hidden);
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (!active || !effect) {
      setVisibleEffect(null);
      return;
    }
    setStamp(null);
    setVisibleEffect(effect);
    const timer = window.setTimeout(
      () => setVisibleEffect(null),
      reducedMotion ? 1_400 : 780,
    );
    return () => window.clearTimeout(timer);
  }, [active, effect, reducedMotion]);

  useEffect(() => {
    if (!active || paused || documentHidden || reducedMotion || visibleEffect) {
      setStamp(null);
      return;
    }
    let stopTimer: number | null = null;
    const startTimer = window.setTimeout(() => {
      sequenceRef.current += 1;
      const positionIndex = Math.min(
        SIGNAL_SAFE_STAMP_POSITIONS.length - 1,
        Math.floor(random() * SIGNAL_SAFE_STAMP_POSITIONS.length),
      );
      setStamp({
        position: SIGNAL_SAFE_STAMP_POSITIONS[positionIndex] ?? "top-left",
        sequence: sequenceRef.current,
      });
      stopTimer = window.setTimeout(() => {
        setStamp(null);
        setAmbientCycle((current) => current + 1);
      }, nextSignalStampDuration(random));
    }, nextSignalAmbientDelay(random));
    return () => {
      window.clearTimeout(startTimer);
      if (stopTimer !== null) window.clearTimeout(stopTimer);
    };
  }, [
    active,
    ambientCycle,
    documentHidden,
    paused,
    random,
    reducedMotion,
    visibleEffect,
  ]);

  if (!active) return null;

  return (
    <div
      className={`signal-effects ${paused || documentHidden ? "is-paused" : ""} ${
        reducedMotion ? "is-reduced" : ""
      }`}
      aria-hidden="true"
    >
      <div className="signal-effects__noise" />
      <div className="signal-effects__grid" />
      <div className="signal-effects__bars" />
      <div className="signal-effects__timecode signal-effects__timecode--top">
        BK_05 // CH 001 // 48.000
      </div>
      <div className="signal-effects__timecode signal-effects__timecode--side">
        PRIVATE SIGNAL // DEVICE LOCAL
      </div>
      <div className="signal-effects__strip">
        <span>
          BAKBAK PRIVATE NETWORK // HOLD THE LINE // SIGNAL RED // BAKBAK
          PRIVATE NETWORK // HOLD THE LINE // SIGNAL RED //
        </span>
        <span>
          BAKBAK PRIVATE NETWORK // HOLD THE LINE // SIGNAL RED // BAKBAK
          PRIVATE NETWORK // HOLD THE LINE // SIGNAL RED //
        </span>
      </div>
      {stamp ? (
        <div
          key={stamp.sequence}
          className={`signal-effects__stamp is-${stamp.position}`}
        >
          <i />
          <strong>BAKBAK</strong>
          <span>TRANSMISSION MARK</span>
        </div>
      ) : null}
      {visibleEffect ? (
        <div
          key={visibleEffect.sequence}
          className={`signal-effects__event signal-effects__event--${visibleEffect.event.type}`}
        >
          <span>BK // EVENT</span>
          <strong>{communicationEffectLabel(visibleEffect.event)}</strong>
          <i />
        </div>
      ) : null}
    </div>
  );
}
