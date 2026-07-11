type AudioContextConstructor = new () => AudioContext;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!Context) return null;
  if (!audioContext || audioContext.state === "closed") {
    audioContext = new Context();
  }
  return audioContext;
}

export async function enableIncomingMessageSound(): Promise<void> {
  try {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") await context.resume();
  } catch {
    // A later user gesture can try again.
  }
}

export async function playIncomingMessageSound(): Promise<void> {
  try {
    await enableIncomingMessageSound();
    const context = getAudioContext();
    if (!context || context.state !== "running") return;

    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(620, now);
    oscillator.frequency.exponentialRampToValueAtTime(860, now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.15);
  } catch {
    // Audio may still be blocked until the first user gesture. Chat must continue.
  }
}
