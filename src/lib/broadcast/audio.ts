/** Logarithmic fader taper: position 0..1 -> dB. Unity (0 dB) at 0.75, +10 dB at top, -inf at bottom. */
export function faderToDb(pos: number): number {
  if (pos <= 0) return -Infinity;
  if (pos >= 0.75) return (Math.min(pos, 1) - 0.75) * 40;
  return -60 * Math.pow((0.75 - pos) / 0.75, 1.6);
}

export function dbToGain(db: number): number {
  return db === -Infinity ? 0 : Math.pow(10, db / 20);
}

export function gainToDb(g: number): number {
  return g <= 0.000001 ? -Infinity : 20 * Math.log10(g);
}

/** Meter scale: maps dBFS (-60..+6) to 0..1 */
export function dbToMeter(db: number): number {
  if (db === -Infinity) return 0;
  return Math.max(0, Math.min(1, (db + 60) / 66));
}

export function formatDb(db: number): string {
  if (db === -Infinity) return "-∞";
  return (db > 0 ? "+" : "") + db.toFixed(1);
}

export function smpte(ms: number, fps = 30): string {
  const totalFrames = Math.floor((ms / 1000) * fps);
  const f = totalFrames % fps;
  const s = Math.floor(totalFrames / fps) % 60;
  const m = Math.floor(totalFrames / fps / 60) % 60;
  const h = Math.floor(totalFrames / fps / 3600);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(m)}:${p(s)}:${p(f)}`;
}
