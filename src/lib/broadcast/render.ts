export type SourceKind = "bars" | "sim" | "web" | "camera" | "screen" | "file";
export type TransitionType = "MIX" | "FADE" | "SLIDE" | "WIPE" | "STINGER" | "PUSH" | "ZOOM" | "BLUR" | "CIRCLE WIPE" | "FLIP";

export interface Input {
  id: string;
  name: string;
  kind: SourceKind;
  hue: number;
  video?: HTMLVideoElement | undefined;
  stream?: MediaStream | undefined;
  analyser?: AnalyserNode | undefined;
}

export interface Dsk {
  lowerThird: { on: boolean; name: string; title: string };
  score: { on: boolean; home: string; away: string; homeScore: number; awayScore: number };
  pip: { on: boolean; inputId: string };
  logo: { on: boolean; text: string };
}

export type DskAlpha = { lowerThird: number; score: number; pip: number; logo: number };
export const SW = 640;
export const SH = 360;

function bars(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const top = ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0"];
  const mid = ["#0000c0", "#131313", "#c000c0", "#131313", "#00c0c0", "#131313", "#c0c0c0"];
  const bw = w / 7;
  top.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, h * 0.67); });
  mid.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, h * 0.67, bw + 1, h * 0.08); });
  const bot: [string, number][] = [["#00214c", 1.25], ["#ffffff", 1.25], ["#32006a", 1.25], ["#131313", 1.25], ["#090909", 0.33], ["#131313", 0.34], ["#1d1d1d", 0.33], ["#131313", 1]];
  let x = 0;
  bot.forEach(([c, u]) => { ctx.fillStyle = c; ctx.fillRect(x, h * 0.75, u * bw + 1, h * 0.25); x += u * bw; });
}

function clockText(t: number) {
  return new Date(t).toLocaleTimeString("pt-BR", { hour12: false });
}

export function drawSource(ctx: CanvasRenderingContext2D, input: Input, w: number, h: number, now: number) {
  const t = now / 1000;
  ctx.save();
  switch (input.kind) {
    case "bars":
      bars(ctx, w, h);
      ctx.fillStyle = "rgba(0,0,0,.6)"; ctx.fillRect(w / 2 - 90, h * 0.3, 180, 36);
      ctx.fillStyle = "#fff"; ctx.font = "600 16px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
      ctx.fillText("SMPTE · 1kHz -20dBFS", w / 2, h * 0.3 + 23);
      break;
    case "sim": {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, `hsl(${input.hue},45%,${18 + 6 * Math.sin(t * 0.5)}%)`);
      g.addColorStop(1, `hsl(${input.hue + 40},50%,8%)`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,.06)";
      for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
      for (let i = 0; i < 4; i++) {
        const cx = w / 2 + Math.sin(t * (0.4 + i * 0.2) + i) * w * 0.32;
        const cy = h / 2 + Math.cos(t * (0.3 + i * 0.15) + i * 2) * h * 0.28;
        ctx.fillStyle = `hsla(${input.hue + i * 30},70%,60%,.35)`;
        ctx.beginPath(); ctx.arc(cx, cy, 30 + i * 14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = "700 34px 'IBM Plex Sans', sans-serif"; ctx.textAlign = "center";
      ctx.fillText(input.name.toUpperCase(), w / 2, h / 2 + 12);
      ctx.font = "500 14px 'JetBrains Mono', monospace"; ctx.fillStyle = "rgba(255,255,255,.6)";
      ctx.fillText(`SIM · 1080p29.97 · ${clockText(now)}`, w / 2, h / 2 + 40);
      break;
    }
    case "web": {
      ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.7, h * 0.3, 10, w * 0.7, h * 0.3, w * 0.7);
      g.addColorStop(0, "rgba(56,189,248,.35)"); g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e2e8f0"; ctx.font = "700 64px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
      ctx.fillText(clockText(now), 40, h / 2);
      ctx.font = "500 16px 'IBM Plex Sans', sans-serif"; ctx.fillStyle = "#94a3b8";
      ctx.fillText("WEB SOURCE · HTML5 BROWSER INPUT", 42, h / 2 + 32);
      ctx.fillStyle = "#38bdf8"; ctx.fillRect(0, h - 36, w, 36);
      ctx.fillStyle = "#0b1220"; ctx.font = "600 15px 'IBM Plex Sans', sans-serif";
      const msg = "  ◆  MERCADOS: IBOV +0,84%  ◆  USD/BRL 5,12  ◆  CLIMA SP 24°C  ◆  PRÓXIMO BLOCO 15:00";
      const off = (t * 80) % 900;
      ctx.fillText(msg + msg, w - off, h - 12);
      break;
    }
    default: {
      const v = input.video;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const r = Math.max(w / v.videoWidth, h / v.videoHeight);
        const dw = v.videoWidth * r, dh = v.videoHeight * r;
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = "#111"; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#666"; ctx.font = "600 20px 'JetBrains Mono', monospace"; ctx.textAlign = "center";
        ctx.fillText("NO SIGNAL", w / 2, h / 2);
      }
    }
  }
  ctx.restore();
}

export function composite(
  ctx: CanvasRenderingContext2D, a: CanvasImageSource, b: CanvasImageSource | null,
  type: TransitionType, p: number, w: number, h: number,
) {
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  if (!b || p <= 0) { ctx.drawImage(a, 0, 0, w, h); return; }
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  switch (type) {
    case "MIX":
      ctx.drawImage(a, 0, 0, w, h); ctx.globalAlpha = p; ctx.drawImage(b, 0, 0, w, h); ctx.globalAlpha = 1; break;
    case "FADE":
      ctx.drawImage(p < 0.5 ? a : b, 0, 0, w, h);
      ctx.fillStyle = `rgba(0,0,0,${p < 0.5 ? p * 2 : (1 - p) * 2})`; ctx.fillRect(0, 0, w, h); break;
    case "SLIDE":
      ctx.drawImage(a, -e * w, 0, w, h); ctx.drawImage(b, w - e * w, 0, w, h); break;
    case "WIPE":
      ctx.drawImage(a, 0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, p * w, h); ctx.clip(); ctx.drawImage(b, 0, 0, w, h); ctx.restore();
      ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillRect(p * w - 2, 0, 3, h); break;
    case "PUSH":
      ctx.drawImage(a, -e * w, 0, w, h);
      ctx.drawImage(b, (1 - e) * w, 0, w, h);
      break;
    case "ZOOM":
      ctx.drawImage(a, 0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = p;
      const scale = 0.65 + 0.35 * e;
      ctx.translate(w / 2, h / 2);
      ctx.scale(scale, scale);
      ctx.drawImage(b, -w / 2, -h / 2, w, h);
      ctx.restore();
      break;
    case "BLUR": {
      const radius = Math.round(18 * Math.sin(Math.PI * p));
      ctx.save();
      ctx.filter = radius > 0 ? `blur(${radius}px)` : "none";
      ctx.drawImage(a, 0, 0, w, h);
      ctx.globalAlpha = p;
      ctx.drawImage(b, 0, 0, w, h);
      ctx.restore();
      break;
    }
    case "CIRCLE WIPE":
      ctx.drawImage(a, 0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, Math.hypot(w, h) * p / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(b, 0, 0, w, h);
      ctx.restore();
      break;
    case "FLIP": {
      const xScale = Math.abs(Math.cos(Math.PI * p));
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(Math.max(0.001, xScale), 1);
      ctx.drawImage(p < 0.5 ? a : b, -w / 2, -h / 2, w, h);
      ctx.restore();
      break;
    }
    case "STINGER": {
      ctx.drawImage(p < 0.5 ? a : b, 0, 0, w, h);
      const x = -w * 0.6 + p * w * 2.2;
      ctx.save(); ctx.translate(x, 0); ctx.transform(1, 0, -0.35, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, w * 0.6, 0);
      g.addColorStop(0, "#dc2626"); g.addColorStop(0.5, "#111827"); g.addColorStop(1, "#dc2626");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w * 0.6, h * 1.2);
      ctx.fillStyle = "#fff"; ctx.font = `800 ${h * 0.09}px 'IBM Plex Sans', sans-serif`; ctx.textAlign = "center";
      ctx.fillText("STUDIO", w * 0.3 + h * 0.2, h * 0.55);
      ctx.restore(); break;
    }
  }
}

export function drawOverlays(
  ctx: CanvasRenderingContext2D, dsk: Dsk, alpha: DskAlpha,
  pipSrc: CanvasImageSource | null, w: number, h: number,
) {
  const s = w / 1280;
  ctx.save();
  if (alpha.lowerThird > 0) {
    const a = alpha.lowerThird; ctx.globalAlpha = a;
    const x = 90 * s - (1 - a) * 80 * s, y = h - 175 * s;
    ctx.fillStyle = "#dc2626"; ctx.fillRect(x, y, 10 * s, 92 * s);
    ctx.fillStyle = "rgba(10,12,18,.92)"; ctx.fillRect(x + 10 * s, y, 600 * s, 58 * s);
    ctx.fillStyle = "rgba(220,38,38,.92)"; ctx.fillRect(x + 10 * s, y + 58 * s, 420 * s, 34 * s);
    ctx.fillStyle = "#fff"; ctx.textAlign = "left";
    ctx.font = `700 ${32 * s}px 'IBM Plex Sans', sans-serif`; ctx.fillText(dsk.lowerThird.name, x + 30 * s, y + 41 * s);
    ctx.font = `500 ${20 * s}px 'IBM Plex Sans', sans-serif`; ctx.fillText(dsk.lowerThird.title.toUpperCase(), x + 30 * s, y + 83 * s);
  }
  if (alpha.score > 0) {
    ctx.globalAlpha = alpha.score;
    const x = 70 * s, y = 50 * s, sc = dsk.score;
    ctx.fillStyle = "rgba(10,12,18,.92)"; ctx.fillRect(x, y, 380 * s, 48 * s);
    ctx.fillStyle = "#dc2626"; ctx.fillRect(x + 150 * s, y, 80 * s, 48 * s);
    ctx.fillStyle = "#fff"; ctx.font = `700 ${22 * s}px 'IBM Plex Sans', sans-serif`; ctx.textAlign = "center";
    ctx.fillText(sc.home.toUpperCase(), x + 75 * s, y + 32 * s);
    ctx.fillText(sc.away.toUpperCase(), x + 305 * s, y + 32 * s);
    ctx.font = `700 ${26 * s}px 'JetBrains Mono', monospace`;
    ctx.fillText(`${sc.homeScore}-${sc.awayScore}`, x + 190 * s, y + 34 * s);
  }
  if (alpha.pip > 0 && pipSrc) {
    ctx.globalAlpha = alpha.pip;
    const pw = 384 * s, ph = 216 * s, x = w - pw - 70 * s, y = 50 * s;
    ctx.fillStyle = "#fff"; ctx.fillRect(x - 3 * s, y - 3 * s, pw + 6 * s, ph + 6 * s);
    ctx.drawImage(pipSrc, x, y, pw, ph);
  }
  if (alpha.logo > 0) {
    ctx.globalAlpha = alpha.logo * 0.85;
    const x = w - 150 * s, y = h - 110 * s;
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(x + 40 * s, y + 35 * s, 30 * s, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = `800 ${20 * s}px 'IBM Plex Sans', sans-serif`; ctx.textAlign = "center";
    ctx.fillText(dsk.logo.text.slice(0, 4).toUpperCase(), x + 40 * s, y + 42 * s);
  }
  ctx.restore();
}
