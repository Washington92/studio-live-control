import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent, type ReactNode } from "react";
import { Camera, Circle, Film, Globe, Monitor, Plus, Minus, Settings, Radio, Square, Trash2, Video, Grid3x3, Grip, Volume2, VolumeX, Headphones } from "lucide-react";
import { composite, drawOverlays, drawSource, SH, SW, type Dsk, type DskAlpha, type Input, type SourceKind, type TransitionType } from "@/lib/broadcast/render";
import { dbToGain, faderToDb, smpte } from "@/lib/broadcast/audio";
import { ProgramOutputEngine } from "@/lib/broadcast/program-output";
import { WhipPublisher } from "@/lib/broadcast/whip-output";
import { cn } from "@/lib/utils";
import { nativeEngine } from "@/lib/broadcast/native-engine";
import { Meter, Strip, type Channel, type Level } from "./Mixer";

const TRANSITIONS: TransitionType[] = ["MIX", "FADE", "SLIDE", "WIPE", "STINGER", "PUSH", "ZOOM", "BLUR", "CIRCLE WIPE", "FLIP"];
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
  const [inputGroups, setInputGroups] = useState<{ id: string; name: string }[]>([{ id: "all", name: "Todas" }]);
  const [activeInputGroup, setActiveInputGroup] = useState("all");
  const [inputGroupAssignments, setInputGroupAssignments] = useState<Record<string, string>>({});
  const visibleInputs = activeInputGroup === "all" ? inputs : inputs.filter((item) => inputGroupAssignments[item.id] === activeInputGroup);
  const createInputGroup = () => {
    const name = window.prompt("Nome do novo grupo de entradas")?.trim();
    if (!name) return;
    const id = `group-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setInputGroups((current) => [...current, { id, name }]);
    setActiveInputGroup(id);
  };
  const renameInputGroup = () => {
    if (activeInputGroup === "all") return;
    const group = inputGroups.find((item) => item.id === activeInputGroup);
    const name = window.prompt("Renomear grupo", group?.name)?.trim();
    if (name) setInputGroups((current) => current.map((item) => item.id === activeInputGroup ? { ...item, name } : item));
  };
  const deleteInputGroup = () => {
    if (activeInputGroup === "all") return;
    if (!window.confirm("Excluir este grupo? As entradas serão mantidas em Todas.")) return;
    setInputGroups((current) => current.filter((item) => item.id !== activeInputGroup));
    setInputGroupAssignments((current) => Object.fromEntries(Object.entries(current).filter(([, groupId]) => groupId !== activeInputGroup)));
    setActiveInputGroup("all");
  };
  const [dockOrder, setDockOrder] = useState<DockId[]>(readDockOrder);
  const [dockSizes, setDockSizes] = useState<DockSizes>(readDockSizes);
  const [draggingPanel, setDraggingPanel] = useState<DockId | null>(null);
  const [inputsActionsOpen, setInputsActionsOpen] = useState(false);
  const [selectedInputId, setSelectedInputId] = useState<string | null>(INITIAL[0]!.id);
  const [monitorInputId, setMonitorInputId] = useState<string | null>(null);
  const [monitorError, setMonitorError] = useState("");
  const [settingsInputId, setSettingsInputId] = useState<string | null>(null);
  const [settingsTab, setSettingsTab] = useState<"geral" | "audio" | "video" | "avancado">("geral");
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
  const [nativeStatus, setNativeStatus] = useState<"web" | "offline" | "ready">("web");
  const [nativeDiagnostic, setNativeDiagnostic] = useState("");
  const [nativeBusy, setNativeBusy] = useState(false);
  useEffect(() => {
    const bridge = nativeEngine();
    if (!bridge) return;
    let active = true;
    bridge.status().then(({ ready }) => {
      if (active) setNativeStatus(ready ? "ready" : "offline");
    }).catch(() => { if (active) setNativeStatus("offline"); });
    const unsubscribe = bridge.onEvent((event) => {
      if (active) setNativeStatus(event.type === "ready" ? "ready" : "offline");
    });
    return () => { active = false; unsubscribe(); };
  }, []);

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
      // Production shortcuts must never fire while editing or manipulating a control.
      if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest('input, textarea, select, button, [role="slider"], [role="dialog"], [contenteditable="true"]')) return;
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
    setSelectedInputId(inp.id);
    setInputsActionsOpen(false);
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
    setInputGroupAssignments((current) => Object.fromEntries(Object.entries(current).filter(([inputId]) => inputId !== id)));
    setSelectedInputId((current) => current === id ? null : current);
    setSettingsInputId((current) => current === id ? null : current);
    srcCanvases.current.delete(id);
  };

  const renameInput = (id: string) => {
    const input = inputs.find((item) => item.id === id);
    if (!input) return;
    const name = window.prompt("Renomear entrada", input.name)?.trim();
    if (!name || name === input.name) return;
    setInputs((current) => current.map((item) => item.id === id ? { ...item, name } : item));
  };
  // Independent headphone cue: never changes PGM audio routing.
  useEffect(() => {
    if (!monitorInputId) return;
    const input = inputs.find((item) => item.id === monitorInputId);
    if (!input?.stream?.getAudioTracks().some((track) => track.readyState === "live")) {
      setMonitorInputId(null);
      return;
    }
    const player = document.createElement("audio");
    player.srcObject = input.stream;
    player.autoplay = true;
    player.volume = 1;
    void player.play().catch(() => {
      setMonitorError("Não foi possível iniciar a escuta. Verifique a saída de áudio e tente novamente.");
      setMonitorInputId(null);
    });
    return () => {
      player.pause();
      player.srcObject = null;
    };
  }, [monitorInputId, inputs]);

  const updateInputAudio = (id: string, patch: Partial<Channel>) => {
    setChannels((current) => ({
      ...current,
      [id]: { ...(current[id] ?? defCh(inputs.find((item) => item.id === id)?.kind ?? "sim")), ...patch },
    }));
  };

  const configureSelectedInput = () => {
    const selected = inputs.find((input) => input.id === selectedInputId);
    if (!selected) return;
    const name = window.prompt("Nome da fonte", selected.name)?.trim();
    if (!name || name === selected.name) return;
    setInputs((current) => current.map((input) => input.id === selected.id ? { ...input, name } : input));
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
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background font-sans text-foreground select-none">
      {/* TOP TELEMETRY */}
      <header className="flex min-h-12 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-panel-strong px-3 py-2 sm:flex-nowrap">
        <div className="flex items-center gap-2">
          <img src="/wmix-logo.svg" alt="wMix" className="h-8 w-auto max-w-[125px] object-contain" />
        </div>

        <div className="hidden flex-1 sm:block" />
        <span role="status" aria-live="polite" title="Estado do motor nativo; o compositor web continua independente" className="rounded-md border border-border bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          {nativeStatus === "ready" ? "OBS: CONECTADO" : nativeStatus === "offline" ? "OBS: OFFLINE" : "MOTOR: WEB"}
        </span>
        {nativeStatus === "ready" && (
          <button type="button" disabled={nativeBusy} className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold hover:bg-accent disabled:opacity-50" title="Criar fonte de teste somente no motor nativo; não altera as entradas web" onClick={async () => {
            const bridge = nativeEngine();
            if (!bridge) return;
            setNativeBusy(true);
            try {
              const response = await bridge.command("ADD_TEST_SOURCE");
              setNativeDiagnostic(response);
            } catch (error) {
              setNativeDiagnostic(error instanceof Error ? error.message : "Falha na fonte de teste");
            } finally {
              setNativeBusy(false);
            }
          }}>TESTAR FONTE OBS</button>
        )}
        {nativeDiagnostic && <span role="status" className="max-w-[210px] truncate text-[10px] text-muted-foreground" title={nativeDiagnostic}>{nativeDiagnostic}</span>}
        {nativeStatus === "offline" && nativeEngine()?.restart && (
          <button type="button" className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold hover:bg-accent" title="Tentar reiniciar o processo nativo" onClick={async () => {
            try {
              const result = await nativeEngine()?.restart?.();
              if (!result?.restarted) console.warn("WMix engine restart:", result?.reason);
            } catch (error) { console.error("WMix engine restart failed:", error); }
          }}>REINICIAR OBS</button>
        )}
        <Timer label="REC" since={rec} now={now} tone="pgm" />
        <Timer label="LIVE" since={live} now={now} tone="pgm" />
        <button onClick={toggleRec} className={cn("flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold tracking-wider", rec ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>
          {rec ? <Square className="h-3 w-3 fill-current" /> : <Circle className="h-3 w-3 fill-pgm text-pgm" />} {rec ? "PARAR REC" : "GRAVAR"}
        </button>
        <button disabled={whipBusy} onClick={() => { if (live) void stopWhip(); else setWhipSettingsOpen(true); }} className={cn("flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold tracking-wider", live ? "animate-pulse border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>
          <Radio className="h-4 w-4" /> {live ? "NO AR" : "TRANSMITIR"}
        </button>
      </header>

      {whipSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <section role="dialog" aria-modal="true" aria-label="Configurar transmissão WHIP" className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-md border border-border bg-panel p-5 shadow-2xl">
            <h2 className="text-base font-bold">Transmissão ao vivo · WebRTC/WHIP</h2>
            <p className="text-xs text-muted-foreground">Transmite o Program e o áudio Master para um destino WHIP HTTPS. RTMP/RTMPS (YouTube) ainda não está disponível nesta versão.</p>
            <label className="block space-y-1 text-xs">
              <span>URL WHIP (HTTPS)</span>
              <input className="w-full rounded-md border border-border bg-input-bg p-2 text-foreground" type="url" value={whipEndpoint} onChange={(event) => setWhipEndpoint(event.target.value)} placeholder="https://servidor.exemplo/whip" autoComplete="off" />
            </label>
            <label className="block space-y-1 text-xs">
              <span>Token Bearer (opcional)</span>
              <input className="w-full rounded-md border border-border bg-input-bg p-2 text-foreground" type="password" value={whipToken} onChange={(event) => setWhipToken(event.target.value)} placeholder="Não será armazenado" autoComplete="off" />
            </label>
            {whipError && <p role="alert" className="rounded-md border border-pgm p-2 text-xs text-pgm">{whipError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={whipBusy} className="rounded-md border border-border bg-secondary px-3 py-2 text-xs" onClick={() => { setWhipSettingsOpen(false); setWhipError(""); setWhipToken(""); }}>Cancelar</button>
              <button type="button" disabled={whipBusy || !whipEndpoint.trim()} className="rounded-md bg-pgm px-3 py-2 text-xs font-bold text-pgm-foreground disabled:opacity-50" onClick={() => void startWhip()}>
                {whipBusy ? "Conectando..." : "Iniciar transmissão"}
              </button>
            </div>
          </section>
        </div>
      )}

      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-2">
        <div className="wmix-dock-grid flex flex-wrap items-start gap-2">
        <DockPanel id="preview" title="PREVIEW" order={dockOrder.indexOf("preview")} size={dockSizes.preview} onResize={resizeDock} dragging={draggingPanel === "preview"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<MonitorBox title="PREVIEW" tone="pvw" source={nameOf(pvw)} safe={safe}><canvas ref={pvwRef} width={960} height={540} className="h-full w-full" /></MonitorBox>
        </DockPanel>
        <DockPanel id="transitions" title="TRANSIÇÕES" order={dockOrder.indexOf("transitions")} size={dockSizes.transitions} onResize={resizeDock} dragging={draggingPanel === "transitions"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<div className="rounded-md border border-border bg-panel p-2">
            <div className="mb-2 text-center text-xs font-semibold tracking-wide text-foreground">Transições</div>
            <div className="flex min-w-0 gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="grid grid-cols-3 gap-1" role="group" aria-label="Selecionar efeito de transição">
                  {TRANSITIONS.map((t) => (
                    <button key={t} type="button" onClick={() => setTrType(t)}
                      aria-pressed={trType === t} title={t}
                      className={cn("flex h-10 min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border transition-colors", trType === t ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                      <span aria-hidden="true" className="flex h-4 w-7 items-center justify-center overflow-hidden rounded-sm border border-current/70">
                        {t === "MIX" && <span className="h-full w-full bg-current/25" />}
                        {t === "FADE" && <span className="h-full w-full bg-gradient-to-r from-transparent via-current/40 to-current/80" />}
                        {t === "SLIDE" && <span className="flex h-full w-full"><span className="h-full w-1/2 border-r border-current bg-current/35" /><span className="h-full w-1/2" /></span>}
                        {t === "WIPE" && <span className="h-full w-1/2 self-start bg-current/60" />}
                        {t === "STINGER" && <span className="text-[11px] font-bold leading-none">✦</span>}
                        {t === "PUSH" && <span className="text-[10px] font-bold">→</span>}
                        {t === "ZOOM" && <span className="text-[10px] font-bold">⊕</span>}
                        {t === "BLUR" && <span className="text-[10px] font-bold opacity-50">▧</span>}
                        {t === "CIRCLE WIPE" && <span className="text-[11px] font-bold">◉</span>}
                        {t === "FLIP" && <span className="text-[10px] font-bold">⇄</span>}
                      </span>
                      <span className="text-[9px] font-semibold">{t}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                  <span className="font-semibold">Duração</span>
                  <div className="flex items-center rounded-md border border-border bg-secondary">
                    <button type="button" aria-label="Diminuir duração" onClick={() => setDur((value) => Math.max(100, value - 100))} className="px-2 py-1 hover:text-primary">−</button>
                    <span className="min-w-12 text-center tabular-nums text-foreground">{(dur / 1000).toFixed(1)} s</span>
                    <button type="button" aria-label="Aumentar duração" onClick={() => setDur((value) => Math.min(10000, value + 100))} className="px-2 py-1 hover:text-primary">+</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" onClick={doAuto} aria-label="Iniciar transição automática do Preview para Program" className={cn("h-8 rounded-md border text-xs font-bold", progress > 0 ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>AUTO</button>
                  <button type="button" onClick={cut} aria-label="Corte imediato do Preview para Program" className="h-8 rounded-md border border-primary bg-primary text-xs font-bold text-primary-foreground hover:opacity-90">CUT</button>
                </div>
              </div>
              <div className="flex w-[65px] shrink-0 flex-col items-center justify-center gap-1 border-l border-border pl-2">
                <span className="text-[9px] font-semibold text-muted-foreground">T-BAR</span>
                <div className="flex h-[132px] items-center justify-center gap-1">
                  <input type="range" min={0} max={1} step={0.001} value={progress} onChange={(e) => onTbar(Number(e.target.value))} className="tbar" aria-label="T-Bar" />
                </div>
                <span className="text-[10px] font-semibold tabular-nums text-foreground">{Math.round(progress * 100)}%</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button onClick={() => setFtb((f) => !f)} className={cn("h-7 rounded-md border text-[10px] font-bold tracking-wider", ftb ? "animate-pulse border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary hover:bg-accent")}>FTB</button>
              <button onClick={() => setSafe((value) => !value)} className={cn("h-7 rounded-md border text-[10px] font-bold", safe ? "border-primary text-primary" : "border-border text-muted-foreground")}>SAFE AREAS</button>
            </div>
          </div>
        </DockPanel>
        <DockPanel id="program" title="PROGRAM" order={dockOrder.indexOf("program")} size={dockSizes.program} onResize={resizeDock} dragging={draggingPanel === "program"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<MonitorBox title="PROGRAM" tone="pgm" source={nameOf(pgm)} safe={safe}><canvas ref={pgmRef} width={960} height={540} className="h-full w-full" /></MonitorBox>
        </DockPanel>
        <DockPanel id="inputs" title="ENTRADAS" order={dockOrder.indexOf("inputs")} size={dockSizes.inputs} onResize={resizeDock} dragging={draggingPanel === "inputs"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<div className="flex min-h-0 flex-col rounded-md border border-border bg-panel font-sans text-xs">
            <div className="flex flex-wrap items-center gap-1 px-2 pt-2 pb-1">
              
              {monitorError && <span role="alert" className="max-w-48 truncate text-[10px] text-pgm" title={monitorError}>{monitorError}</span>}
              <button type="button" aria-label="Adicionar fonte" title="Adicionar fonte" onClick={() => setInputsActionsOpen((open) => !open)} aria-expanded={inputsActionsOpen} className="rounded-md border border-border bg-secondary p-1 hover:text-primary"><Plus className="h-4 w-4" /></button>
              <button type="button" aria-label="Remover fonte selecionada" title="Remover fonte selecionada" disabled={!selectedInputId || selectedInputId === pgm || selectedInputId === pvw} onClick={() => { if (selectedInputId) removeInput(selectedInputId); }} className="rounded-md border border-border bg-secondary p-1 hover:text-pgm disabled:opacity-40"><Minus className="h-4 w-4" /></button>
              <button type="button" aria-label="Configurações da fonte selecionada" title="Renomear fonte selecionada" disabled={!selectedInputId} onClick={configureSelectedInput} className="rounded-md border border-border bg-secondary p-1 hover:text-primary disabled:opacity-40"><Settings className="h-4 w-4" /></button>
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

            </div>
            <div className="flex flex-wrap items-center gap-1 px-2 pb-1" aria-label="Grupos de entradas">
              {inputGroups.map((group) => (
                <button key={group.id} type="button" onClick={() => setActiveInputGroup(group.id)}
                  aria-pressed={activeInputGroup === group.id}
                  className={cn("rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors", activeInputGroup === group.id ? "border-primary bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground hover:text-foreground")}>
                  {group.name} · {group.id === "all" ? inputs.length : inputs.filter((item) => inputGroupAssignments[item.id] === group.id).length}
                </button>
              ))}
              <button type="button" onClick={createInputGroup} aria-label="Criar grupo" title="Criar grupo" className="rounded-md border border-border p-1 text-muted-foreground hover:text-primary"><Plus className="h-3.5 w-3.5" /></button>
              {activeInputGroup !== "all" && (
                <>
                  <button type="button" onClick={renameInputGroup} aria-label="Renomear grupo" title="Renomear grupo" className="rounded-md border border-border p-1 text-muted-foreground hover:text-primary"><Settings className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={deleteInputGroup} aria-label="Excluir grupo" title="Excluir grupo sem remover entradas" className="rounded-md border border-border p-1 text-muted-foreground hover:text-pgm"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
              <select aria-label="Mover entrada selecionada para grupo" title="Atribuir entrada selecionada a um grupo"
                disabled={!selectedInputId}
                value={selectedInputId ? inputGroupAssignments[selectedInputId] ?? "all" : "all"}
                onChange={(event) => { if (!selectedInputId) return; setInputGroupAssignments((current) => ({ ...current, [selectedInputId]: event.target.value })); }}
                className="ml-auto max-w-36 rounded-md border border-border bg-secondary px-1 py-1 text-[10px] text-foreground disabled:opacity-40">
                <option value="all">Sem grupo</option>
                {inputGroups.filter((group) => group.id !== "all").map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-2">
              <div className="grid w-max auto-rows-max content-start gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(10, Math.max(1, visibleInputs.length))}, 190px)` }}>
              {visibleInputs.map((inp) => {
                const i = inputs.findIndex((item) => item.id === inp.id);
                const tally = tallyOf(inp.id); const Icon = KIND_ICON[inp.kind];
                const audio = channels[inp.id] ?? defCh(inp.kind);
                return (
                  <div key={inp.id} className={cn("group overflow-hidden rounded-xl border-2 bg-panel-strong transition-colors", tally === "pgm" ? "border-pgm" : tally === "pvw" ? "border-pvw" : "border-border")}>
                    <div className="flex items-stretch bg-black">
                      <button onClick={() => { setSelectedInputId(inp.id); setPvw(inp.id); }} onDoubleClick={() => setPgm(inp.id)} className="relative block min-w-0 flex-1 aspect-video overflow-hidden bg-black">
                        <canvas ref={(el) => { if (el) thumbs.current.set(inp.id, el); else thumbs.current.delete(inp.id); }} width={320} height={180} className="absolute inset-0 h-full w-full object-contain" />
                        <span className="absolute left-1 top-1 rounded-md bg-background/80 px-1 text-[10px] font-semibold">{i + 1}</span>
                        {tally && <span className={cn("absolute right-1 top-1 rounded-md px-1 text-[10px] font-semibold", tally === "pgm" ? "bg-pgm text-pgm-foreground" : "bg-pvw text-pvw-foreground")}>{tally === "pgm" ? "PGM" : "PVW"}</span>}
                        <div className="absolute bottom-1 right-1 flex h-8 gap-px"><Meter level={levels[inp.id]} className="w-1" /></div>
                      </button>
                      <div className="flex w-9 shrink-0 flex-col items-center justify-center gap-1 border-l border-border/40 bg-panel/70 px-0.5 py-1">
                        <input type="range" min={0} max={1000} step={1}
                          value={Math.round(audio.fader * 1000)}
                          onChange={(event) => updateInputAudio(inp.id, { fader: Number(event.target.value) / 1000 })}
                          onDoubleClick={() => updateInputAudio(inp.id, { fader: 0.75 })}
                          aria-label={`Volume de ${inp.name}`}
                          title={`Volume: ${audio.fader === 0 ? "-∞" : faderToDb(audio.fader).toFixed(0)} dB`}
                          className="input-mini-fader"
                        />
                        <span className="text-[9px] font-medium tabular-nums text-muted-foreground">{Math.round(audio.fader * 100)}%</span>
                        <button type="button" aria-label={`${audio.mute ? "Ativar" : "Silenciar"} áudio de ${inp.name}`} title={audio.mute ? "Ativar áudio" : "Silenciar áudio"} onClick={() => updateInputAudio(inp.id, { mute: !audio.mute })} className={cn("flex h-5 w-6 items-center justify-center rounded-md transition-colors", audio.mute ? "text-muted-foreground" : "text-primary hover:bg-primary/10")}>
                          {audio.mute ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-panel px-1.5 py-1.5">
                      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs font-medium">{inp.name}</span>
                      <button type="button"
                        disabled={!inp.stream?.getAudioTracks().some((track) => track.readyState === "live")}
                        aria-pressed={monitorInputId === inp.id}
                        aria-label={`${monitorInputId === inp.id ? "Parar escuta de" : "Ouvir no fone"} ${inp.name}`}
                        title={inp.stream?.getAudioTracks().some((track) => track.readyState === "live") ? "Escutar fonte no fone (sem alterar Program)" : "Esta fonte não possui faixa de áudio monitorável"}
                        onClick={() => { setMonitorError(""); setMonitorInputId((id) => id === inp.id ? null : inp.id); }}
                        className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30", monitorInputId === inp.id ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground hover:text-foreground")}
                      ><Headphones className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setPgm(inp.id)} aria-label={`Cortar ${inp.name} diretamente para Program`} className="rounded-md bg-secondary px-1 text-[10px] font-semibold hover:bg-pgm hover:text-pgm-foreground" title="Cortar direto para PGM">CUT</button>
                      <button onClick={() => removeInput(inp.id)} className="text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-pgm" title="Remover"><Trash2 className="h-3 w-3" /></button>
                    </div>
                    <div className="flex items-center gap-1 px-1.5 pb-1.5">
                      <button type="button" aria-pressed={audio.mute} title={audio.mute ? "Ativar áudio" : "Silenciar áudio"}
                        onClick={() => updateInputAudio(inp.id, { mute: !audio.mute })}
                        className={cn("rounded-md border px-1.5 py-0.5 text-[10px] font-semibold", audio.mute ? "border-pgm bg-pgm text-pgm-foreground" : "border-border bg-secondary text-muted-foreground")}>{audio.mute ? "MUTADO" : "MUTAR"}</button>
                      <button type="button" title="Configurações da entrada" aria-label={`Configurações de ${inp.name}`}
                        onClick={() => { setSettingsInputId(inp.id); setSettingsTab("geral"); }}
                        className="ml-auto rounded-md border border-border bg-secondary p-1 text-muted-foreground hover:text-primary"><Settings className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </DockPanel>
        {settingsInputId && (() => {
          const input = inputs.find((item) => item.id === settingsInputId);
          if (!input) return null;
          const ch = channels[input.id] ?? defCh(input.kind);
          const hasAudio = input.kind === "camera" || input.kind === "screen" || input.kind === "file";
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsInputId(null); }}>
              <section role="dialog" aria-modal="true" aria-label={`Configurações de ${input.name}`} className="flex w-full max-w-lg flex-col gap-3 rounded-md border border-border bg-panel p-4 font-sans text-xs leading-relaxed shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0"><div className="text-sm font-semibold tracking-wide">CONFIGURAÇÕES DA ENTRADA</div><div className="truncate text-xs text-muted-foreground">{input.name}</div></div>
                  <button type="button" onClick={() => setSettingsInputId(null)} className="rounded-md border border-border px-2 py-1 text-xs font-medium">FECHAR</button>
                </div>
                <div className="flex flex-wrap gap-1 border-b border-border pb-2">
                  {(["geral", "audio", "video", "avancado"] as const).map((tab) => (
                    <button type="button" key={tab} onClick={() => setSettingsTab(tab)} className={cn("rounded-md border px-3 py-1.5 text-xs font-medium uppercase", settingsTab === tab ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary")}>{tab === "audio" ? "Áudio" : tab === "avancado" ? "Avançado" : tab === "video" ? "Vídeo" : "Geral"}</button>
                  ))}
                </div>
                {settingsTab === "geral" && <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs">Nome da entrada
                    <input className="rounded-md border border-border bg-background p-2 text-xs" value={input.name} maxLength={80} onChange={(event) => setInputs((current) => current.map((item) => item.id === input.id ? { ...item, name: event.target.value } : item))} />
                  </label>
                  <div className="text-xs text-muted-foreground">Tipo: {input.kind} · ID: {input.id}</div>
                  <button type="button" className="self-start rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium" onClick={() => { const copy = mkInput(input.kind, `${input.name} (cópia)`, input.hue); if (input.kind === "camera" || input.kind === "screen" || input.kind === "file") { window.alert("Para duplicar esta fonte de mídia, adicione-a novamente pelo painel de entradas."); return; } addInput(copy); setSettingsInputId(copy.id); }}>Duplicar entrada</button>
                  <button type="button" disabled={input.id === pgm || input.id === pvw} className="self-start rounded-md border border-border px-3 py-2 text-xs font-medium text-pgm disabled:opacity-40" onClick={() => { removeInput(input.id); setSettingsInputId(null); }}>Remover entrada</button>
                  {(input.id === pgm || input.id === pvw) && <div className="text-xs text-muted-foreground">Para remover, retire a entrada de Preview e Program primeiro.</div>}
                </div>}
                {settingsTab === "audio" && <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-2 text-xs">Volume individual: {ch.fader === 0 ? "-∞" : faderToDb(ch.fader).toFixed(1)} dB
                    <input type="range" min={0} max={1000} value={Math.round(ch.fader * 1000)} onChange={(event) => updateInputAudio(input.id, { fader: Number(event.target.value) / 1000 })} onDoubleClick={() => updateInputAudio(input.id, { fader: 0.75 })} aria-label="Volume individual" className="w-full accent-primary" />
                  </label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ch.mute} onChange={(event) => updateInputAudio(input.id, { mute: event.target.checked })} /> Mutar entrada</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ch.afv} onChange={(event) => updateInputAudio(input.id, { afv: event.target.checked })} /> Áudio acompanha vídeo (AFV)</label>
                  <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ch.solo} onChange={(event) => updateInputAudio(input.id, { solo: event.target.checked })} /> Solo</label>
                  <div className="text-xs text-muted-foreground">{hasAudio ? "Os ajustes utilizam o canal desta entrada no mixer." : "Esta fonte não fornece áudio de mídia; os ajustes do canal ficam disponíveis para compatibilidade com o mixer."}</div>
                </div>}
                {settingsTab === "video" && <div className="flex flex-col gap-2 text-xs">
                  <div>Tipo de vídeo: {input.kind}</div>
                  {input.video ? <><div>Resolução detectada: {input.video.videoWidth || "—"} × {input.video.videoHeight || "—"}</div><label className="flex items-center gap-2"><input type="checkbox" checked={input.video.paused} onChange={(event) => { if (event.target.checked) input.video?.pause(); else void input.video?.play(); setInputs((current) => [...current]); }} /> Pausar reprodução</label></> : <div className="text-muted-foreground">Esta entrada não possui controles de reprodução de vídeo.</div>}
                  <div className="text-muted-foreground">Correção de cor, chroma key e transformações exigem integração com o motor de renderização; não estão disponíveis nesta versão.</div>
                </div>}
                {settingsTab === "avancado" && <div className="flex flex-col gap-2 text-xs">
                  <div>Identificador: {input.id}</div>
                  <div>Fonte: {input.kind}</div>
                  <div>Captura de áudio: {input.stream?.getAudioTracks().length ?? 0} trilha(s)</div>
                  <div>Captura de vídeo: {input.stream?.getVideoTracks().length ?? 0} trilha(s)</div>
                  <div className="text-muted-foreground">PTZ, FPS configurável, sincronização e gatilhos serão disponibilizados quando suportados pelo motor.</div>
                </div>}
              </section>
            </div>
          );
        })()}
        <DockPanel id="dsk" title="DSK · OVERLAYS" order={dockOrder.indexOf("dsk")} size={dockSizes.dsk} onResize={resizeDock} dragging={draggingPanel === "dsk"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<div className="flex min-h-0 flex-col gap-2 overflow-auto rounded-lg bg-panel p-2.5">
            <div className="flex items-center justify-between gap-2 pr-7"><span className="text-xs font-semibold tracking-wide text-foreground">Overlays</span><span className="rounded-full border border-border bg-secondary/70 px-2 py-0.5 text-[10px] text-muted-foreground">{[dsk.lowerThird.on, dsk.score.on, dsk.pip.on, dsk.logo.on].filter(Boolean).length} ativos</span></div>
            <DskRow n={1} label="Lower Third" on={dsk.lowerThird.on} onToggle={() => setDsk((d) => ({ ...d, lowerThird: { ...d.lowerThird, ...lt, on: !d.lowerThird.on } }))}>
              <input aria-label="Nome do lower third" className="field" value={lt.name} onChange={(e) => setLt({ ...lt, name: e.target.value })} placeholder="Nome" />
              <input aria-label="Cargo do lower third" className="field" value={lt.title} onChange={(e) => setLt({ ...lt, title: e.target.value })} placeholder="Cargo" />
            </DskRow>
            <DskRow n={2} label="Placar" on={dsk.score.on} onToggle={() => setDsk((d) => ({ ...d, score: { ...d.score, on: !d.score.on } }))}>
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_minmax(0,1fr)] items-center gap-1.5">
                <input aria-label="Equipe da casa" className="field min-w-0" value={dsk.score.home} onChange={(e) => setDsk((d) => ({ ...d, score: { ...d.score, home: e.target.value } }))} />
                <ScoreBtn v={dsk.score.homeScore} set={(v) => setDsk((d) => ({ ...d, score: { ...d.score, homeScore: v } }))} />
                <ScoreBtn v={dsk.score.awayScore} set={(v) => setDsk((d) => ({ ...d, score: { ...d.score, awayScore: v } }))} />
                <input aria-label="Equipe visitante" className="field min-w-0" value={dsk.score.away} onChange={(e) => setDsk((d) => ({ ...d, score: { ...d.score, away: e.target.value } }))} />
              </div>
            </DskRow>
            <DskRow n={3} label="PiP" on={dsk.pip.on} onToggle={() => setDsk((d) => ({ ...d, pip: { ...d.pip, on: !d.pip.on } }))}>
              <select aria-label="Fonte do picture in picture" className="field" value={dsk.pip.inputId} onChange={(e) => setDsk((d) => ({ ...d, pip: { ...d.pip, inputId: e.target.value } }))}>
                {inputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </DskRow>
            <DskRow n={4} label="Logo / Bug" on={dsk.logo.on} onToggle={() => setDsk((d) => ({ ...d, logo: { ...d.logo, on: !d.logo.on } }))}>
              <input aria-label="Texto do logo" className="field" value={dsk.logo.text} maxLength={4} onChange={(e) => setDsk((d) => ({ ...d, logo: { ...d.logo, text: e.target.value } }))} />
            </DskRow>
          </div>
        </DockPanel>
        <DockPanel id="mixer" title="MIXER DE ÁUDIO" order={dockOrder.indexOf("mixer")} size={dockSizes.mixer} onResize={resizeDock} dragging={draggingPanel === "mixer"} onDragStart={startPanelDrag} onDragEnd={() => setDraggingPanel(null)} onDrop={dropPanel}>
<section className="flex h-full min-h-[250px] min-w-0 flex-col gap-2 overflow-hidden rounded-lg bg-panel p-2.5">
          <div className="shrink-0 text-xs font-semibold tracking-wide text-foreground">Mixer de áudio</div>
          <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-x-auto">
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {inputs.map((inp) => channels[inp.id] && (
              <Strip key={inp.id} name={inp.name} ch={channels[inp.id]!} level={levels[inp.id]} onAir={tallyOf(inp.id) === "pgm"}
                onChange={(c) => setChannels((s) => ({ ...s, [inp.id]: { ...s[inp.id]!, ...c } }))} />
            ))}
          </div>
          <div className="w-px shrink-0 bg-border/70" />
          <div className="flex shrink-0 gap-1.5">
            {(["aux1", "aux2", "master"] as const).map((k) => (
              <Strip key={k} isBus name={k === "master" ? "MASTER" : k.toUpperCase()} ch={buses[k]!} level={levels[k]} onAir={k === "master" && !!live}
                onChange={(c) => setBuses((s) => ({ ...s, [k]: { ...s[k]!, ...c } }))} />
            ))}
          </div>
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
        <span className="flex items-center gap-1">MASTER           <span className="relative h-2 w-28 overflow-hidden rounded-md bg-meter-bg"><span className="absolute inset-y-0 left-0 bg-meter-h" style={{ width: `${Math.min(100, ((20 * Math.log10(Math.max(levels['master']?.rms ?? 0, 1e-6)) + 60) / 66) * 100)}%` }} /></span>
        </span>
        {anySolo && <span className="rounded-md bg-warn px-1 font-bold text-warn-foreground">SOLO ATIVO</span>}
        {ftb && <span className="rounded-md bg-pgm px-1 font-bold text-pgm-foreground">FTB</span>}
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
type DockSize = { columns: number; height: number | null; width?: number };
type DockSizes = Record<DockId, DockSize>;
const DEFAULT_DOCK_SIZES: DockSizes = {
  preview: { columns: 4, height: 270 },
  transitions: { columns: 4, height: null },
  program: { columns: 4, height: 270 },
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
      if (typeof columns === "number" && Number.isInteger(columns) && columns >= 2 && columns <= 12) defaults[id].columns = columns;
      if (typeof height === "number" && Number.isFinite(height)) defaults[id].height = Math.max(110, Math.min(1200, height));
      const width = (item as Partial<DockSize>).width;
      if (typeof width === "number" && Number.isFinite(width)) defaults[id].width = Math.max(180, Math.min(1600, width));
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
  id, title, order, size, dragging, onDragStart, onDragEnd, onDrop, onResize, children,
}: {
  id: DockId; title: string; order: number; size: DockSize; dragging: boolean;
  onResize: (id: DockId, size: DockSize) => void;
  onDragStart: (event: DragEvent<HTMLElement>, id: DockId) => void;
  onDragEnd: () => void;
  onDrop: (event: DragEvent<HTMLElement>, id: DockId) => void;
  children: ReactNode;
}) {
  const resizeStart = useRef<{ x: number; y: number; width: number; height: number; size: DockSize } | null>(null);
  const beginResize = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const panel = event.currentTarget.closest("section");
    resizeStart.current = { x: event.clientX, y: event.clientY, width: panel?.clientWidth ?? 300, height: panel?.clientHeight ?? 260, size };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizePanel = (event: PointerEvent<HTMLButtonElement>) => {
    const start = resizeStart.current;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const width = Math.max(180, Math.min(1600, Math.round(start.width + deltaX)));
    const height = Math.max(110, Math.min(1200, Math.round(start.height + event.clientY - start.y)));
    onResize(id, { ...start.size, width, height });
  };
  return (
    <section
      className={cn("wmix-dock-panel relative flex min-w-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-panel shadow-sm", dragging && "opacity-50")}
      style={{ order, height: size.height ?? (id === "preview" || id === "program" ? 270 : undefined), minHeight: 110, "--wmix-columns": size.columns, "--wmix-width": size.width ? `${size.width}px` : `${size.columns / 12 * 100}%` } as CSSProperties}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
      onDrop={(event) => onDrop(event, id)}
    >
      <div
        draggable
        onDragStart={(event) => onDragStart(event, id)}
        onDragEnd={onDragEnd}
        title={`Arrastar painel ${title}`}
        aria-label={`Arrastar painel ${title}`}
        className="absolute right-2 top-2 z-20 flex h-6 w-6 cursor-grab items-center justify-center rounded-md border border-border/60 bg-panel-strong/85 text-muted-foreground opacity-60 shadow-sm transition-opacity hover:opacity-100 active:cursor-grabbing"
      >
        <Grip aria-hidden="true" className="h-3.5 w-3.5" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-1.5">{children}</div>
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
      <span className="font-sans text-[10px] tracking-widest text-muted-foreground">{label}</span>
      <span className={cn("font-sans text-xs font-semibold", warn ? "text-warn" : "text-foreground")}>{value}</span>
    </div>
  );
}
function Timer({ label, since, now }: { label: string; since: number | null; now: number; tone: "pgm" }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-xs", since ? "border-pgm text-foreground" : "border-border text-muted-foreground")}>
      <span className={cn("text-[10px] font-bold", since && "text-pgm")}>{label}</span>
      {smpte(since ? now - since : 0)}
    </div>
  );
}
function MonitorBox({ title, tone, source, safe, children }: { title: string; tone: "pvw" | "pgm"; source: string; safe: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border-2 bg-black", tone === "pgm" ? "border-pgm" : "border-pvw")}>
      <div className={cn("flex shrink-0 items-center justify-between gap-2 px-2 py-1 font-sans text-xs font-semibold tracking-wide", tone === "pgm" ? "bg-pgm text-pgm-foreground" : "bg-pvw text-pvw-foreground")}>
        <span>{title}</span><span className="truncate">{source}</span>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
        <div className="relative aspect-video h-full max-h-full max-w-full overflow-hidden [&>canvas]:absolute [&>canvas]:inset-0 [&>canvas]:h-full [&>canvas]:w-full">
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
    </div>
  );
}
function AddBtn({ icon: Icon, label, onClick }: { icon: typeof Camera; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex h-6 items-center gap-1 rounded-md border border-border bg-secondary px-2 text-[10px] font-semibold hover:bg-accent">
      <Icon className="h-3 w-3" />{label}
    </button>
  );
}
function DskRow({ n, label, on, onToggle, children }: { n: number; label: string; on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-xl border p-2.5 transition-colors", on ? "border-pgm/50 bg-pgm/5" : "border-border/70 bg-panel-strong/40")}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold tabular-nums", on ? "bg-pgm/15 text-pgm" : "bg-secondary text-muted-foreground")}>{n.toString().padStart(2, "0")}</span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-xs font-semibold text-foreground">{label}</span>
          <span className={cn("text-[10px]", on ? "text-pgm" : "text-muted-foreground")}>{on ? "No ar" : "Pronto para exibir"}</span>
        </div>
        <button type="button" onClick={onToggle} aria-pressed={on} aria-label={`${on ? "Desativar" : "Exibir"} ${label}`} className={cn("h-7 min-w-16 shrink-0 rounded-lg border px-2 text-[10px] font-bold tracking-wide transition-colors", on ? "border-pgm bg-pgm text-pgm-foreground hover:opacity-90" : "border-border bg-secondary text-foreground hover:bg-accent")}>{on ? "NO AR" : "EXIBIR"}</button>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
function ScoreBtn({ v, set }: { v: number; set: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button className="h-6 w-5 rounded-md bg-secondary text-xs" onClick={() => set(Math.max(0, v - 1))}>−</button>
      <span className="w-5 text-center font-sans text-sm font-bold">{v}</span>
      <button className="h-6 w-5 rounded-md bg-secondary text-xs" onClick={() => set(v + 1)}>+</button>
    </div>
  );
}
function Dot({ ok }: { ok: boolean }) {
  return <span className={cn("-mr-3 inline-block h-1.5 w-1.5 rounded-full", ok ? "bg-pvw" : "bg-pgm")} />;
}
