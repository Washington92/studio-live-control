import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { Camera, Circle, Film, Globe, Monitor, Plus, Radio, Square, Trash2, Video, Grid3x3 } from "lucide-react";
import { composite, drawOverlays, drawSource, SH, SW, type Dsk, type DskAlpha, type Input, type SourceKind, type TransitionType } from "@/lib/broadcast/render";
import { dbToGain, faderToDb, smpte } from "@/lib/broadcast/audio";
import { ProgramOutputEngine } from "@/lib/broadcast/program-output";
import { WhipPublisher } from "@/lib/broadcast/whip-output";
import { cn } from "@/lib/utils";
import { Meter, Strip, type Channel, type Level } from "./Mixer";

const TRANSITIONS: TransitionType[] = ["MIX", "FADE", "SLIDE", "WIPE", "STINGER"];
let idSeq = 0;
const newId = () => `in${++idSeq}`;

const mkInput = (kind: SourceKind, name: string, hue = 210): Input => ({ id: newId(), kind, name, hue });
const INITIAL: Input[] = [
  mkInput("sim", "Câmera 1", 210), mkInput("sim", "Câmera 2", 150), mkInput("sim", "Câmera 3", 20),
  mkInput("bars", "Barras SMPTE"), mkInput("web", "Fonte Web"),
];
const defCh = (kind: SourceKind): Channel => ({ fader: 0.75, mute: kind === "bars", solo: false, afv: kind === "sim" || kind === "camera", a1: false, a2: false });

let audioCtx: AudioContext | null = null;
function attachAnalyser(stream: MediaStream): AnalyserNode | undefined {
  if (!stream.getAudioTracks().length) return;
  audioCtx ??= new AudioContext();
  const an = audioCtx.createAnalyser(); an.fftSize = 1024;
  audioCtx.createMediaStreamSource(stream).connect(an);
  return an;
}
function makeVideo(src: MediaStream | string) {
  const v = document.createElement("video");
  v.muted = true; v.playsInline = true; v.loop = true;
  if (typeof src === "string") v.src = src; else v.srcObject = src;
  void v.play();
  return v;
}
const KIND_ICON: Record<SourceKind, typeof Camera> = { sim: Video, camera: Camera, screen: Monitor, file: Film, bars: Grid3x3, web: Globe };

export function Studio() {
  const [inputs, setInputs] = useState<Input[]>(INITIAL);
  const [dockOrder, setDockOrder] = useState<DockId[]>(readDockOrder);
  const [dockSizes, setDockSizes] = useState<DockSizes>(readDockSizes);
  const [draggingPanel, setDraggingPanel] = useState<DockId | null>(null);
  const [inputsActionsOpen, setInputsActionsOpen] = useState(true);
  const [pgm, setPgm] = useState(INITIAL[0]!.id);
  const [pvw, setPvw] = useState(INITIAL[1]!.id);
  const [trType, setTrType] = useState<TransitionType>("MIX");
  const [dur, setDur] = useState(1000);
  const [progress, setProgress] = useState(0);
  const [ftb, setFtb] = useState(false);
  const [safe, setSafe] = useState(true);
  const [dsk, setDsk] = useState<Dsk>({
    lowerThird: { on: false, name: "Ana Ribeiro", title: "Diretora de Operações" },
    score: { on: false, home: "SAN", away: "COR", homeScore: 1, awayScore: 0 },
    pip: { on: false, inputId: INITIAL[2]!.id },
    logo: { on: true, text: "TV" },
  });
  const [channels, setChannels] = useState<Record<string, Channel>>(() => Object.fromEntries(INITIAL.map((i) => [i.id, defCh(i.kind)])));
  const [buses, setBuses] = useState<Record<string, Channel>>({
    master: { fader: 0.75, mute: false, solo: false, afv: false, a1: false, a2: false },
    aux1: { fader: 0.75, mute: false, solo: false, afv: false, a1: false, a2: false },
    aux2: { fader: 0.75, mute: false, solo: false, afv: false, a1: false, a2: false },
  });
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [live, setLive] = useState<number | null>(null);
  const [whipSettingsOpen, setWhipSettingsOpen] = useState(false);
  const [whipEndpoint, setWhipEndpoint] = useState("");
  const [whipToken, setWhipToken] = useState("");
  const [whipBusy, setWhipBusy] = useState(false);
  const [whipError, setWhipError] = useState("");
  const [rec, setRec] = useState<number | null>(null);
  const [tele, setTele] = useState({ fps: 0, render: 0, mem: 0, load: 0, dropped: 0 });
  const [now, setNow] = useState(0);
  const [lt, setLt] = useState({ name: "Ana Ribeiro", title: "Diretora de Operações" });

  const pvwRef = useRef<HTMLCanvasElement>(null);
  const pgmRef = useRef<HTMLCanvasElement>(null);
  const thumbs = useRef(new Map<string, HTMLCanvasElement>());
  const srcCanvases = useRef(new Map<string, HTMLCanvasElement>());
  const auto = useRef<{ start: number } | null>(null);
  const prog = useRef(0);
  const ftbAlpha = useRef(0);
  const dskAlpha = useRef<DskAlpha>({ lowerThird: 0, score: 0, pip: 0, logo: 0 });
  const peaks = useRef<Record<string, number>>({});
  const recorder = useRef<MediaRecorder | null>(null);
  const output = useRef<ProgramOutputEngine | null>(null);
  const whipOutput = useRef<ProgramOutputEngine | null>(null);
  const whipPublisher = useRef<WhipPublisher | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { window.localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify(dockOrder)); }
    catch { /* Private browsing or disabled storage: layout stays in memory. */ }
  }, [dockOrder]);

  useEffect(() => {
    try { window.localStorage.setItem(DOCK_SIZES_KEY, JSON.stringify(dockSizes)); }
    catch { /* Disabled storage: keep sizes in memory. */ }
  }, [dockSizes]);
  const resizeDock = (id: DockId, size: DockSize) => {
    setDockSizes((current) => ({ ...current, [id]: size }));
  };

  const startPanelDrag = (event: DragEvent<HTMLElement>, id: DockId) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDraggingPanel(id);
  };
  const dropPanel = (event: DragEvent<HTMLElement>, target: DockId) => {
    event.preventDefault();
    const source = event.dataTransfer.getData("text/plain");
    if (isDockId(source)) setDockOrder((current) => moveDockPanel(current, source, target));
    setDraggingPanel(null);
  };
  const movePanel = (id: DockId, delta: number) => {
    setDockOrder((current) => {
      const index = current.indexOf(id);
      const target = current[Math.max(0, Math.min(current.length - 1, index + delta))];
      return target ? moveDockPanel(current, id, target) : current;
    });
  };

  const S = useRef({ inputs, pgm, pvw, trType, dur, ftb, dsk, channels, buses });
  S.current = { inputs, pgm, pvw, trType, dur, ftb, dsk, channels, buses };

  const complete = useCallback(() => {
    const { pgm: a, pvw: b } = S.current;
    setPgm(b); setPvw(a); prog.current = 0; setProgress(0); auto.current = null;
  }, []);
  const cut = useCallback(() => { if (!auto.current) complete(); }, [complete]);
  const doAuto = useCallback(() => { if (!auto.current) auto.current = { start: performance.now() - prog.current * S.current.dur }; }, []);
  const onTbar = (v: number) => { if (auto.current) return; prog.current = v; setProgress(v); if (v >= 1) complete(); };

  // Render + audio engine loop
  useEffect(() => {
    let raf = 0, frames = 0, lastT = performance.now(), renderAcc = 0, dropped = 0, last = performance.now(), audioTick = 0;
    const getSrc = (id: string) => {
      let c = srcCanvases.current.get(id);
      if (!c) { c = document.createElement("canvas"); c.width = SW; c.height = SH; srcCanvases.current.set(id, c); }
      return c;
    };
    const buf = new Float32Array(1024);
    const loop = () => {
      const t0 = performance.now();
      if (t0 - last > 50) dropped++;
      last = t0;
      const st = S.current;
      if (auto.current) {
        const p = (t0 - auto.current.start) / st.dur;
        if (p >= 1) complete(); else { prog.current = p; setProgress(p); }
      }
      ftbAlpha.current += ((st.ftb ? 1 : 0) - ftbAlpha.current) * 0.08;
      for (const k of Object.keys(dskAlpha.current) as (keyof DskAlpha)[]) {
        const on = st.dsk[k].on;
        dskAlpha.current[k] = Math.max(0, Math.min(1, dskAlpha.current[k] + (on ? 0.08 : -0.08)));
      }
      for (const inp of st.inputs) {
        const c = getSrc(inp.id); drawSource(c.getContext("2d")!, inp, SW, SH, Date.now());
        const th = thumbs.current.get(inp.id);
        if (th && frames % 2 === 0) th.getContext("2d")!.drawImage(c, 0, 0, th.width, th.height);
      }
      const a = srcCanvases.current.get(st.pgm), b = srcCanvases.current.get(st.pvw);
      const pipSrc = srcCanvases.current.get(st.dsk.pip.inputId) ?? null;
      for (const [ref, isPgm] of [[pgmRef, true], [pvwRef, false]] as const) {
        const cv = ref.current; if (!cv) continue;
        const ctx = cv.getContext("2d")!;
        if (isPgm && a) composite(ctx, a, b ?? null, st.trType, prog.current, cv.width, cv.height);
        else if (b) composite(ctx, b, null, st.trType, 0, cv.width, cv.height);
        drawOverlays(ctx, st.dsk, dskAlpha.current, pipSrc, cv.width, cv.height);
        if (isPgm && ftbAlpha.current > 0.005) { ctx.fillStyle = `rgba(0,0,0,${ftbAlpha.current})`; ctx.fillRect(0, 0, cv.width, cv.height); }
      }
      // Route the real Program audio to the recording bus; keep visual meters unchanged.
      whipOutput.current?.update({
        inputs: st.inputs,
        channels: st.channels,
        master: st.buses.master,
        programId: st.pgm,
        previewId: st.pvw,
        transition: prog.current,
        fadeToBlack: ftbAlpha.current,
      });
      output.current?.update({
        inputs: st.inputs,
        channels: st.channels,
        master: st.buses.master,
        programId: st.pgm,
        previewId: st.pvw,
        transition: prog.current,
        fadeToBlack: ftbAlpha.current,
      });
      // audio
      if (++audioTick % 3 === 0) {
        const t = t0 / 1000, anySolo = Object.values(st.channels).some((c) => c.solo);
        const out: Record<string, Level> = {};
        let m = 0, x1 = 0, x2 = 0;
        const p = prog.current;
        for (const inp of st.inputs) {
          const ch = st.channels[inp.id]; if (!ch) continue;
          let raw: number;
          if (inp.analyser) { inp.analyser.getFloatTimeDomainData(buf); let s = 0; for (const v of buf) s += v * v; raw = Math.sqrt(s / buf.length); }
          else if (inp.kind === "bars") raw = 0.1;
          else if (inp.kind === "web") raw = 0.12 + 0.1 * Math.abs(Math.sin(t * 2.1)) + Math.random() * 0.06;
          else if (inp.kind === "sim") raw = 0.06 + 0.16 * Math.abs(Math.sin(t * 3.1 + inp.hue)) * Math.abs(Math.sin(t * 7.3)) + Math.random() * 0.04;
          else raw = 0.04 + Math.random() * 0.05;
          let gate = 1;
          if (ch.afv) gate = inp.id === st.pgm ? 1 - (p > 0 ? p : 0) : inp.id === st.pvw ? p : 0;
          if (ch.mute || (anySolo && !ch.solo)) gate = 0;
          const g = dbToGain(faderToDb(ch.fader)) * gate;
          const rms = Math.min(1.4, raw * g), inst = Math.min(1.4, rms * 1.41 + Math.random() * 0.02 * g);
          const pk = Math.max(inst, (peaks.current[inp.id] ?? 0) * 0.94); peaks.current[inp.id] = pk;
          out[inp.id] = { rms, peak: pk };
          m += rms * rms; if (ch.a1) x1 += rms * rms; if (ch.a2) x2 += rms * rms;
        }
        for (const [k, sum] of [["master", m], ["aux1", x1], ["aux2", x2]] as const) {
          const bch = st.buses[k]!;
          let r = Math.sqrt(sum) * dbToGain(faderToDb(bch.fader)) * (bch.mute ? 0 : 1);
          if (k === "master") r *= 1 - ftbAlpha.current;
          const pk = Math.max(Math.min(1.4, r * 1.41), (peaks.current[k] ?? 0) * 0.94); peaks.current[k] = pk;
          out[k] = { rms: Math.min(1.4, r), peak: pk };
        }
        setLevels(out);
      }
      renderAcc += performance.now() - t0; frames++;
      if (t0 - lastT >= 500) {
        const fps = (frames * 1000) / (t0 - lastT), render = renderAcc / frames;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
        setTele({ fps, render, mem: mem / 1048576, load: Math.min(100, (render / 33.3) * 100), dropped });
        frames = 0; renderAcc = 0; lastT = t0;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const clk = setInterval(() => setNow(Date.now()), 33);
    return () => { cancelAnimationFrame(raf); clearInterval(clk); };
  }, [complete]);

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      if (tag === "TEXTAREA" || tag === "SELECT") return;
      if (/^[1-9]$/.test(e.key)) { const i = S.current.inputs[Number(e.key) - 1]; if (i) { if (e.shiftKey) { setPgm(i.id); } else setPvw(i.id); } }
      else if (e.code === "Space") { e.preventDefault(); cut(); }
      else if (e.key === "Enter") { e.preventDefault(); doAuto(); }
      else if (e.key.toLowerCase() === "b") setFtb((f) => !f);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cut, doAuto]);

  const addInput = (inp: Input) => {
    setInputs((l) => [...l, inp]);
    setChannels((c) => ({ ...c, [inp.id]: defCh(inp.kind) }));
  };
  const addCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
        .catch(() => navigator.mediaDevices.getUserMedia({ video: true }));
      addInput({ ...mkInput("camera", `Webcam ${inputs.length + 1}`), stream, video: makeVideo(stream), analyser: attachAnalyser(stream) });
    } catch { alert("Acesso à câmera negado ou indisponível."); }
  };
  const addScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      addInput({ ...mkInput("screen", "Captura de Tela"), stream, video: makeVideo(stream), analyser: attachAnalyser(stream) });
    } catch { /* cancelado */ }
  };
  const addFile = (f: File) => addInput({ ...mkInput("file", f.name.replace(/\.[^.]+$/, "").slice(0, 18)), video: makeVideo(URL.createObjectURL(f)) });
  const removeInput = (id: string) => {
    if (id === pgm || id === pvw) return;
    const inp = inputs.find((i) => i.id === id);
    inp?.stream?.getTracks().forEach((t) => t.stop());
    setInputs((l) => l.filter((i) => i.id !== id));
    srcCanvases.current.delete(id);
  };

  const stopWhip = async () => {
    const publisher = whipPublisher.current;
    const engine = whipOutput.current;
    whipPublisher.current = null;
    whipOutput.current = null;
    setLive(null);
    engine?.stop();
    await publisher?.stop();
  };

  const startWhip = async () => {
    const canvas = pgmRef.current;
    if (!canvas || whipBusy) return;
    setWhipBusy(true);
    setWhipError("");
    const engine = new ProgramOutputEngine(canvas);
    const publisher = new WhipPublisher(() => {
      setWhipError("A transmissão WHIP perdeu a conexão.");
      setWhipSettingsOpen(true);
      void stopWhip();
    });
    try {
      const stream = engine.start();
      const st = S.current;
      engine.update({
        inputs: st.inputs, channels: st.channels, master: st.buses.master,
        programId: st.pgm, previewId: st.pvw,
        transition: prog.current, fadeToBlack: ftbAlpha.current,
      });
      whipOutput.current = engine;
      whipPublisher.current = publisher;
      await publisher.start(stream, whipEndpoint, whipToken);
      setLive(Date.now());
      setWhipToken("");
      setWhipSettingsOpen(false);
    } catch (error) {
      if (whipPublisher.current === publisher) {
        whipPublisher.current = null;
        whipOutput.current = null;
      }
      engine.stop();
      await publisher.stop();
      setLive(null);
      setWhipError(error instanceof Error ? error.message : "Falha ao iniciar transmissão WHIP.");
    } finally {
      setWhipBusy(false);
    }
  };

  const toggleRec = () => {
    if (recorder.current) {
      if (recorder.current.state !== "inactive") recorder.current.stop();
      recorder.current = null;
      setRec(null);
      return;
    }
    const cv = pgmRef.current; if (!cv) return;
    const engine = new ProgramOutputEngine(cv);
    try {
      if (typeof MediaRecorder === "undefined") throw new Error("Gravação não suportada neste navegador");
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("Codificador WebM não disponível");
      const stream = engine.start();
      engine.update({
        inputs: S.current.inputs,
        channels: S.current.channels,
        master: S.current.buses.master,
        programId: S.current.pgm,
        previewId: S.current.pvw,
        transition: prog.current,
        fadeToBlack: ftbAlpha.current,
      });
      const mr = new MediaRecorder(stream, { mimeType });
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = () => {
        engine.stop();
        if (output.current === engine) output.current = null;
        if (recorder.current === mr) recorder.current = null;
        setRec(null);
        if (!chunks.length) return;
        const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `PGM_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
        a.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      };
      mr.onerror = () => { window.alert("Erro durante a gravação do Program"); };
      mr.start(1000);
      output.current = engine;
      recorder.current = mr;
      setRec(Date.now());
    } catch (error) {
      engine.stop();
      window.alert(error instanceof Error ? error.message : "Falha ao iniciar a gravação");
    }
  };

  const tallyOf = (id: string) => (id === pgm || (progress > 0 && id === pvw) ? "pgm" : id === pvw ? "pvw" : null);
  const nameOf = (id: string) => inputs.find((i) => i.id === id)?.name ?? "—";
  const anySolo = Object.values(channels).some((c) => c.solo);

  return (
    <div className="flex h-screen min-h-[860px] flex-col bg-background font-sans text-foreground select-none">
      {/* TOP TELEMETRY */}
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-border bg-panel-strong px-3">
        <div className="flex items-center gap-2">
          <img src="/wmix-logo.svg" alt="wMix" className="h-8 w-auto max-w-[125px] object-contain" />
        </div>

        <div className="flex-1" />
        <Timer label="REC" since={rec} now={now} tone="pgm" />
        <Timer label="LIVE" since={live} now={now} tone="pgm" />
        <button onClick={toggleRec} className={cn("flex h-8 items-center gap-2 rounded-sm border px-3 text-xs font-bold tracking-wider", rec ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>
          {rec ? <Square className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3 fill-pgm text-pgm" />} {rec ? "PARAR REC" : "GRAVAR"}
        </button>
        <button disabled={whipBusy} onClick={() => { if (live) void stopWhip(); else setWhipSettingsOpen(true); }} className={cn("flex h-8 items-center gap-2 rounded-sm border px-3 text-xs font-bold tracking-wider", live ? "animate-pulse border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>
          <Radio className="h-4 w-4" /> {live ? "NO AR" : "TRANSMITIR"}
        </button>
      </header>

      {whipSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <section role="dialog" aria-modal="true" aria-label="Configurar transmissão WHIP" className="w-full max-w-md space-y-3 rounded-md border border-border bg-panel p-5 shadow-2xl">
            <h2 className="text-base font-bold">Transmissão ao vivo · WebRTC/WHIP</h2>
            <p className="text-xs text-muted-foreground">Transmite o Program e o áudio Master para um destino WHIP HTTPS. RTMP/RTMPS (YouTube) ainda não está disponível nesta versão.</p>
            <label className="block space-y-1 text-xs">
              <span>URL WHIP (HTTPS)</span>
              <input className="w-full rounded-sm border border-border bg-input-bg p-2 text-foreground" type="url" value={whipEndpoint} onChange={(event) => setWhipEndpoint(event.target.value)} placeholder="https://servidor.exemplo/whip" autoComplete="off" />
            </label>
            <label className="block space-y-1 text-xs">
              <span>Token Bearer (opcional)</span>
              <input className="w-full rounded-sm border border-border bg-input-bg p-2 text-foreground" type="password" value={whipToken} onChange={(event) => setWhipToken(event.target.value)} placeholder="Não será armazenado" autoComplete="off" />
            </label>
            {whipError && <p role="alert" className="rounded-sm border border-pgm p-2 text-xs text-pgm">{whipError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={whipBusy} className="rounded-sm border border-border bg-secondary px-3 py-2 text-xs" onClick={() => { setWhipSettingsOpen(false); setWhipError(""); setWhipToken(""); }}>Cancelar</button>
              <button type="button" disabled={whipBusy || !whipEndpoint.trim()} className="rounded-sm bg-pgm px-3 py-2 text-xs font-bold text-pgm-foreground disabled:opacity-50" onClick={() => void startWhip()}>
                {whipBusy ? "Conectando..." : "Iniciar transmissão"}
              </button>
            </div>
          </section>
        </div>
      )}

      <main className="min-h-0 flex-1 overflow-auto p-2">
        <div className="grid grid-cols-1 items-start gap-2 lg:grid-cols-12">
        <DockPanel id="preview" title="PREVIEW" order={dockOrder.indexOf("preview")} size={dockSizes.preview} onResize={resizeDock} dragging={draggingPanel === "preview"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<MonitorBox title="PREVIEW" tone="pvw" source={nameOf(pvw)} safe={safe}><canvas ref={pvwRef} width={960} height={540} className="h-full w-full" /></MonitorBox>
        </DockPanel>
        <DockPanel id="transitions" title="TRANSIÇÕES" order={dockOrder.indexOf("transitions")} size={dockSizes.transitions} onResize={resizeDock} dragging={draggingPanel === "transitions"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<div className="flex flex-col gap-1.5 rounded-sm border border-border bg-panel p-2">
            <div className="text-center font-mono text-[10px] tracking-widest text-muted-foreground">TRANSIÇÃO</div>
            <div className="grid grid-cols-2 gap-1">
              <button onClick={cut} className="h-9 rounded-sm border border-border bg-secondary text-xs font-bold hover:bg-accent">CUT</button>
              <button onClick={doAuto} className={cn("h-9 rounded-sm border text-xs font-bold", progress > 0 ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>AUTO</button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {TRANSITIONS.map((t) => (
                <button key={t} onClick={() => setTrType(t)} className={cn("h-6 rounded-sm border text-[9px] font-bold", trType === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground hover:text-foreground")}>{t}</button>
              ))}
            </div>
            <label className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
              DURAÇÃO
              <input type="number" min={100} max={10000} step={100} value={dur} onChange={(e) => setDur(Math.max(100, Number(e.target.value)))} className="w-16 rounded-sm border border-border bg-input-bg px-1 text-right text-foreground" />
              ms
            </label>
            <div className="flex h-[130px] items-center justify-center gap-3">
              <div className="flex h-full flex-col justify-between py-1 font-mono text-[9px] text-muted-foreground"><span>100</span><span>50</span><span>0</span></div>
              <input type="range" min={0} max={1} step={0.001} value={progress} onChange={(e) => onTbar(Number(e.target.value))} className="tbar" aria-label="T-Bar" />
              <div className="font-mono text-xs text-foreground">{Math.round(progress * 100)}%</div>
            </div>
            <button onClick={() => setFtb((f) => !f)} className={cn("h-8 rounded-sm border text-xs font-bold tracking-wider", ftb ? "animate-pulse border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>FTB</button>
            <button onClick={() => setSafe((s) => !s)} className={cn("h-6 rounded-sm border text-[9px] font-bold", safe ? "border-primary text-primary" : "border-border text-muted-foreground")}>SAFE AREAS</button>
          </div>
        </DockPanel>
        <DockPanel id="program" title="PROGRAM" order={dockOrder.indexOf("program")} size={dockSizes.program} onResize={resizeDock} dragging={draggingPanel === "program"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<MonitorBox title="PROGRAM" tone="pgm" source={nameOf(pgm)} safe={safe}><canvas ref={pgmRef} width={960} height={540} className="h-full w-full" /></MonitorBox>
        </DockPanel>
        <DockPanel id="inputs" title="ENTRADAS" order={dockOrder.indexOf("inputs")} size={dockSizes.inputs} onResize={resizeDock} dragging={draggingPanel === "inputs"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<div className="flex min-h-0 flex-col rounded-sm border border-border bg-panel">
            <div className="flex items-center gap-1 border-b border-border px-2 py-1">
              <span className="mr-2 font-mono text-[10px] tracking-widest text-muted-foreground">ENTRADAS · {inputs.length}</span>
              <button type="button" onClick={() => setInputsActionsOpen((open) => !open)} aria-expanded={inputsActionsOpen} className={cn("rounded-sm border px-2 py-1 font-mono text-[10px] font-bold", inputsActionsOpen ? "border-primary text-primary" : "border-border bg-secondary text-muted-foreground")}>INPUTS</button>
              {inputsActionsOpen && (
                <>
              <AddBtn icon={Camera} label="Webcam" onClick={addCamera} />
              <AddBtn icon={Monitor} label="Tela" onClick={addScreen} />
              <AddBtn icon={Film} label="Vídeo" onClick={() => fileRef.current?.click()} />
              <AddBtn icon={Grid3x3} label="Barras" onClick={() => addInput(mkInput("bars", "Barras SMPTE"))} />
              <AddBtn icon={Globe} label="Web" onClick={() => addInput(mkInput("web", "Fonte Web"))} />
              <AddBtn icon={Plus} label="Câm. Sim" onClick={() => addInput(mkInput("sim", `Câmera ${inputs.length + 1}`, Math.floor(Math.random() * 360)))} />
              <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ""; }} />
                </>
              )}
              <span className="ml-auto font-mono text-[9px] text-muted-foreground">1-9 PVW · ⇧1-9 PGM · ESPAÇO CUT · ENTER AUTO · B FTB</span>
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-2 overflow-auto p-2">
              {inputs.map((inp, i) => {
                const tally = tallyOf(inp.id); const Icon = KIND_ICON[inp.kind];
                return (
                  <div key={inp.id} className={cn("group overflow-hidden rounded-sm border-2 bg-panel-strong", tally === "pgm" ? "border-pgm" : tally === "pvw" ? "border-pvw" : "border-border")}>
                    <button onClick={() => setPvw(inp.id)} onDoubleClick={() => setPgm(inp.id)} className="relative block aspect-video w-full bg-black">
                      <canvas ref={(el) => { if (el) thumbs.current.set(inp.id, el); else thumbs.current.delete(inp.id); }} width={320} height={180} className="h-full w-full" />
                      <span className="absolute left-1 top-1 rounded-sm bg-background/80 px-1 font-mono text-[10px] font-bold">{i + 1}</span>
                      {tally && <span className={cn("absolute right-1 top-1 rounded-sm px-1 font-mono text-[9px] font-bold", tally === "pgm" ? "bg-pgm text-pgm-foreground" : "bg-pvw text-pvw-foreground")}>{tally === "pgm" ? "PGM" : "PVW"}</span>}
                      <div className="absolute bottom-1 right-1 flex h-8 gap-px"><Meter level={levels[inp.id]} className="w-1" /></div>
                    </button>
                    <div className="flex items-center gap-1 px-1.5 py-1">
                      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-[11px] font-medium">{inp.name}</span>
                      <button onClick={() => setPgm(inp.id)} className="rounded-sm bg-secondary px-1 font-mono text-[9px] font-bold hover:bg-pgm hover:text-pgm-foreground" title="Cortar direto para PGM">CUT</button>
                      <button onClick={() => removeInput(inp.id)} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-pgm" title="Remover"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DockPanel>
        <DockPanel id="dsk" title="DSK · OVERLAYS" order={dockOrder.indexOf("dsk")} size={dockSizes.dsk} onResize={resizeDock} dragging={draggingPanel === "dsk"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<div className="flex min-h-0 flex-col gap-1.5 overflow-auto rounded-sm border border-border bg-panel p-2">
            <div className="font-mono text-[10px] tracking-widest text-muted-foreground">DSK · OVERLAYS</div>
            <DskRow n={1} label="Lower Third" on={dsk.lowerThird.on} onToggle={() => setDsk((d) => ({ ...d, lowerThird: { ...d.lowerThird, ...lt, on: !d.lowerThird.on } }))}>
              <input className="field" value={lt.name} onChange={(e) => setLt({ ...lt, name: e.target.value })} placeholder="Nome" />
              <input className="field" value={lt.title} onChange={(e) => setLt({ ...lt, title: e.target.value })} placeholder="Cargo" />
            </DskRow>
            <DskRow n={2} label="Placar" on={dsk.score.on} onToggle={() => setDsk((d) => ({ ...d, score: { ...d.score, on: !d.score.on } }))}>
              <div className="grid grid-cols-[1fr_auto_auto_1fr] items-center gap-1">
                <input className="field" value={dsk.score.home} onChange={(e) => setDsk((d) => ({ ...d, score: { ...d.score, home: e.target.value } }))} />
                <ScoreBtn v={dsk.score.homeScore} set={(v) => setDsk((d) => ({ ...d, score: { ...d.score, homeScore: v } }))} />
                <ScoreBtn v={dsk.score.awayScore} set={(v) => setDsk((d) => ({ ...d, score: { ...d.score, awayScore: v } }))} />
                <input className="field" value={dsk.score.away} onChange={(e) => setDsk((d) => ({ ...d, score: { ...d.score, away: e.target.value } }))} />
              </div>
            </DskRow>
            <DskRow n={3} label="PiP" on={dsk.pip.on} onToggle={() => setDsk((d) => ({ ...d, pip: { ...d.pip, on: !d.pip.on } }))}>
              <select className="field" value={dsk.pip.inputId} onChange={(e) => setDsk((d) => ({ ...d, pip: { ...d.pip, inputId: e.target.value } }))}>
                {inputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </DskRow>
            <DskRow n={4} label="Logo / Bug" on={dsk.logo.on} onToggle={() => setDsk((d) => ({ ...d, logo: { ...d.logo, on: !d.logo.on } }))}>
              <input className="field" value={dsk.logo.text} maxLength={4} onChange={(e) => setDsk((d) => ({ ...d, logo: { ...d.logo, text: e.target.value } }))} />
            </DskRow>
          </div>
        </DockPanel>
        <DockPanel id="mixer" title="MIXER DE ÁUDIO" order={dockOrder.indexOf("mixer")} size={dockSizes.mixer} onResize={resizeDock} dragging={draggingPanel === "mixer"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel} onMove={movePanel}>
<section className="flex h-[270px] shrink-0 gap-2 rounded-sm border border-border bg-panel p-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {inputs.map((inp) => channels[inp.id] && (
              <Strip key={inp.id} name={inp.name} ch={channels[inp.id]!} level={levels[inp.id]} onAir={tallyOf(inp.id) === "pgm"}
                onChange={(c) => setChannels((s) => ({ ...s, [inp.id]: { ...s[inp.id]!, ...c } }))} />
            ))}
          </div>
          <div className="w-px bg-border" />
          <div className="flex gap-1.5">
            {(["aux1", "aux2", "master"] as const).map((k) => (
              <Strip key={k} isBus name={k === "master" ? "MASTER" : k.toUpperCase()} ch={buses[k]!} level={levels[k]} onAir={k === "master" && !!live}
                onChange={(c) => setBuses((s) => ({ ...s, [k]: { ...s[k]!, ...c } }))} />
            ))}
          </div>
        </section>
        </DockPanel>
        </div>
      </main>

      {/* STATUS BAR */}
      <footer className="flex h-auto min-h-10 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-panel-strong px-3 py-1 font-mono text-[10px] text-muted-foreground">
        <div className="flex shrink-0 items-center gap-3">
        <Tele label="FPS" value={tele.fps.toFixed(1)} warn={tele.fps < 50} />
        <Tele label="RENDER" value={`${tele.render.toFixed(2)} ms`} warn={tele.render > 16} />
        <Tele label="CARGA" value={`${tele.load.toFixed(0)}%`} warn={tele.load > 70} />
        <Tele label="MEM" value={tele.mem ? `${tele.mem.toFixed(0)} MB` : "n/d"} />
        <Tele label="DROP" value={String(tele.dropped)} warn={tele.dropped > 0} />
        <Tele label="FORMATO" value="1080p30" />
        </div>
        <div className="h-6 w-px shrink-0 bg-border" />
        <Dot ok /> GENLOCK: INTERNO · LOCKED
        <Dot ok /> REF 29.97 Hz
        <Dot ok={tele.dropped === 0} /> SINC VÍDEO {tele.dropped === 0 ? "OK" : `${tele.dropped} DROP`}
        <span>ÁUDIO 48 kHz · 24-bit · 2.0</span>
        <span className="flex items-center gap-1">MASTER           <span className="relative h-2 w-28 overflow-hidden rounded-sm bg-meter-bg"><span className="absolute inset-y-0 left-0 bg-meter-h" style={{ width: `${Math.min(100, ((20 * Math.log10(Math.max(levels['master']?.rms ?? 0, 1e-6)) + 60) / 66) * 100)}%` }} /></span>
        </span>
        {anySolo && <span className="rounded-sm bg-warn px-1 font-bold text-warn-foreground">SOLO ATIVO</span>}
        {ftb && <span className="rounded-sm bg-pgm px-1 font-bold text-pgm-foreground">FTB</span>}
        <span className="ml-auto">TRANS: {trType} {dur}ms</span>
        <span>PGM: {nameOf(pgm)}</span>
        <span>PVW: {nameOf(pvw)}</span>
        <span className="text-foreground">TC {smpte(now ? now % 86_400_000 - new Date().getTimezoneOffset() * 60000 : 0)}</span>
      </footer>
    </div>
  );
}

const DOCK_IDS = ["preview", "transitions", "program", "inputs", "dsk", "mixer"] as const;
type DockId = (typeof DOCK_IDS)[number];
const DOCK_STORAGE_KEY = "wmix:studio-dock-layout:v1";
const DOCK_SIZES_KEY = "wmix:studio-dock-sizes:v1";
type DockSize = { columns: 4 | 8 | 12; height: number | null };
type DockSizes = Record<DockId, DockSize>;
const DEFAULT_DOCK_SIZES: DockSizes = {
  preview: { columns: 4, height: null },
  transitions: { columns: 4, height: null },
  program: { columns: 4, height: null },
  inputs: { columns: 8, height: 300 },
  dsk: { columns: 4, height: 300 },
  mixer: { columns: 8, height: 310 },
};
function readDockSizes(): DockSizes {
  const defaults = Object.fromEntries(DOCK_IDS.map((id) => [id, { ...DEFAULT_DOCK_SIZES[id] }])) as DockSizes;
  if (typeof window === "undefined") return defaults;
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DOCK_SIZES_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return defaults;
    for (const id of DOCK_IDS) {
      const item = (stored as Record<string, unknown>)[id];
      if (!item || typeof item !== "object") continue;
      const { columns, height } = item as Partial<DockSize>;
      if (columns === 4 || columns === 8 || columns === 12) defaults[id].columns = columns;
      if (typeof height === "number" && Number.isFinite(height)) defaults[id].height = Math.max(160, Math.min(1200, height));
    }
  } catch { /* Invalid or inaccessible storage: use defaults. */ }
  return defaults;
}
function isDockId(id: string): id is DockId {
  return DOCK_IDS.some((value) => value === id);
}
function readDockOrder(): DockId[] {
  if (typeof window === "undefined") return [...DOCK_IDS];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(DOCK_STORAGE_KEY) ?? "null");
    if (Array.isArray(stored) && stored.length === DOCK_IDS.length &&
      stored.every((id) => typeof id === "string" && isDockId(id)) &&
      new Set(stored).size === DOCK_IDS.length) return stored as DockId[];
  } catch { /* Invalid or inaccessible storage: use default layout. */ }
  return [...DOCK_IDS];
}
function moveDockPanel(current: DockId[], source: DockId, target: DockId): DockId[] {
  if (source === target || !current.includes(source) || !current.includes(target)) return current;
  const next = current.filter((id) => id !== source);
  next.splice(current.indexOf(target), 0, source);
  return next;
}
function DockPanel({
  id, title, order, size, dragging, onDragStart, onDragEnd, onDrop, onMove, onResize, children,
}: {
  id: DockId; title: string; order: number; size: DockSize; dragging: boolean;
  onResize: (id: DockId, size: DockSize) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: DockId) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>, id: DockId) => void;
  onMove: (id: DockId, delta: number) => void;
  children: ReactNode;
}) {
  const resizeStart = useRef<{ x: number; y: number; width: number; size: DockSize } | null>(null);
  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = event.currentTarget.closest("section");
    resizeStart.current = { x: event.clientX, y: event.clientY, width: panel?.clientWidth ?? 300, size };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizePanel = (event: PointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const stepWidth = Math.max(120, start.width / (start.size.columns / 4));
    const steps = Math.round(deltaX / stepWidth);
    const columns = Math.max(4, Math.min(12, start.size.columns + steps * 4)) as DockSize["columns"];
    const baseHeight = start.size.height ?? Math.max(160, event.currentTarget.closest("section")?.clientHeight ?? 260);
    const height = Math.max(160, Math.min(1200, Math.round(baseHeight + event.clientY - start.y)));
    onResize(id, { columns, height });
  };
  return (
    <section
      className={cn("relative flex min-w-0 flex-col rounded-sm border border-border bg-panel", size.columns === 8 ? "lg:col-span-8" : size.columns === 12 ? "lg:col-span-12" : "lg:col-span-4", dragging && "opacity-50")}
      style={{ order, height: size.height ?? undefined, minHeight: 160 }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => onDrop(event, id)}
    >
      <div className="flex h-7 shrink-0 items-center justify-between border-b border-border bg-panel-strong px-2">
        <span
          draggable
          onDragStart={(event) => onDragStart(event, id)}
          onDragEnd={onDragEnd}
          className="flex flex-1 cursor-grab items-center gap-2 font-mono text-[10px] font-bold tracking-wider text-muted-foreground active:cursor-grabbing"
          title="Arraste para encaixar este painel"
          aria-label={`Arrastar painel ${title}`}
        >
          <span aria-hidden="true">⠿</span>{title}
        </span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMove(id, -1)} className="rounded-sm px-1 text-xs text-muted-foreground hover:bg-accent" title="Mover painel para trás" aria-label={`Mover ${title} para trás`}>←</button>
          <button type="button" onClick={() => onMove(id, 1)} className="rounded-sm px-1 text-xs text-muted-foreground hover:bg-accent" title="Mover painel para frente" aria-label={`Mover ${title} para frente`}>→</button>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-1">{children}</div>
      <button
        type="button"
        aria-label={`Redimensionar ${title}`}
        title="Arraste para ajustar largura e altura do painel"
        className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none rounded-tl-sm bg-panel-strong text-xs text-muted-foreground hover:text-primary"
        onPointerDown={beginResize}
        onPointerMove={resizePanel}
        onPointerUp={() => { resizeStart.current = null; }}
        onPointerCancel={() => { resizeStart.current = null; }}
      >◢</button>
    </section>
  );
}

function Tele({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex flex-col leading-none">
      <span className="font-mono text-[9px] tracking-widest text-muted-foreground">{label}</span>
      <span className={cn("font-mono text-xs font-semibold", warn ? "text-warn" : "text-foreground")}>{value}</span>
    </div>
  );
}
function Timer({ label, since, now }: { label: string; since: number | null; now: number; tone: "pgm" }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-sm border px-2 py-1 font-mono text-xs", since ? "border-pgm text-foreground" : "border-border text-muted-foreground")}>
      <span className={cn("text-[9px] font-bold", since && "text-pgm")}>{label}</span>
      {smpte(since ? now - since : 0)}
    </div>
  );
}
function MonitorBox({ title, tone, source, safe, children }: { title: string; tone: "pvw" | "pgm"; source: string; safe: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-sm border-2 bg-black", tone === "pgm" ? "border-pgm" : "border-pvw")}>
      <div className={cn("flex items-center justify-between px-2 py-0.5 font-mono text-[11px] font-bold", tone === "pgm" ? "bg-pgm text-pgm-foreground" : "bg-pvw text-pvw-foreground")}>
        <span>{title}</span><span className="truncate">{source}</span>
      </div>
      <div className="relative mx-auto aspect-video h-[min(38vh,calc((50vw-110px)*0.5625))]">
        {children}
        {safe && (
          <>
            <div className="pointer-events-none absolute inset-[5%] border border-dashed border-safe" />
            <div className="pointer-events-none absolute inset-[10%] border border-safe" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-safe" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-px w-4 -translate-x-1/2 -translate-y-1/2 bg-safe" />
          </>
        )}
      </div>
    </div>
  );
}
function AddBtn({ icon: Icon, label, onClick }: { icon: typeof Camera; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-6 items-center gap-1 rounded-sm border border-border bg-secondary px-2 text-[10px] font-semibold hover:bg-accent">
      <Icon className="h-3 w-3" />{label}
    </button>
  );
}
function DskRow({ n, label, on, onToggle, children }: { n: number; label: string; on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-sm border p-1.5", on ? "border-pgm bg-pgm/10" : "border-border")}>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">DSK{n}</span>
        <span className="flex-1 text-xs font-semibold">{label}</span>
        <button onClick={onToggle} className={cn("h-6 w-14 rounded-sm border text-[10px] font-bold", on ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>{on ? "ON AIR" : "TAKE"}</button>
      </div>
      {children}
    </div>
  );
}
function ScoreBtn({ v, set }: { v: number; set: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button className="h-6 w-5 rounded-sm bg-secondary text-xs" onClick={() => set(Math.max(0, v - 1))}>−</button>
      <span className="w-5 text-center font-mono text-sm font-bold">{v}</span>
      <button className="h-6 w-5 rounded-sm bg-secondary text-xs" onClick={() => set(v + 1)}>+</button>
    </div>
  );
}
function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("-mr-3 inline-block h-1.5 w-1.5 rounded-full", ok ? "bg-pvw" : "bg-pgm")} />;
}
