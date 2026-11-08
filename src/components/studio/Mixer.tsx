import { dbToMeter, faderToDb, formatDb, gainToDb } from "@/lib/broadcast/audio";
import { cn } from "@/lib/utils";

export interface Channel { fader: number; mute: boolean; solo: boolean; afv: boolean; a1: boolean; a2: boolean }
export interface Level { rms: number; peak: number }

export function Meter({ level, className }: { level?: Level | undefined; className?: string }) {
  const rms = dbToMeter(gainToDb(level?.rms ?? 0));
  const peak = dbToMeter(gainToDb(level?.peak ?? 0));
  const clipping = (level?.peak ?? 0) >= 1;
  return (
    <div role="meter" aria-label="Nível de áudio" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rms * 100)} aria-valuetext={clipping ? "Clipping detectado" : `${Math.round(rms * 100)} por cento`} className={cn("relative w-2 overflow-hidden rounded-sm bg-meter-bg", clipping && "ring-1 ring-pgm", className)}>
      <div className="absolute inset-x-0 bottom-0 bg-meter" style={{ height: `${rms * 100}%`, backgroundSize: "100% var(--meter-h, 160px)" }} />
      <div className={cn("absolute inset-x-0 h-[2px]", clipping ? "bg-pgm" : "bg-foreground")} style={{ bottom: `${peak * 100}%` }} />
      <div className="absolute inset-x-0 h-px bg-pgm/70" style={{ bottom: `${dbToMeter(0) * 100}%` }} />
    </div>
  );
}

function Btn({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone: "mute" | "solo" | "afv" | "bus" }) {
  const toneCls = { mute: "bg-pgm text-pgm-foreground", solo: "bg-warn text-warn-foreground", afv: "bg-pvw text-pvw-foreground", bus: "bg-primary text-primary-foreground" }[tone];
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-6 w-full rounded-md border border-border/70 font-sans text-[10px] font-semibold tracking-wide transition-colors", on ? toneCls : "bg-secondary text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

export function Strip({ name, ch, level, onAir, onChange, isBus }: {
  name: string; ch: Channel; level?: Level | undefined; onAir?: boolean; isBus?: boolean;
  onChange: (c: Partial<Channel>) => void;
}) {
  const db = faderToDb(ch.fader);
  return (
    <div className={cn("flex w-[86px] shrink-0 flex-col gap-1.5 rounded-xl border bg-panel p-2 shadow-sm", onAir ? "border-pgm/80 bg-pgm/5" : "border-border/70", isBus && "bg-panel-strong/70")}>
      <div className={cn("truncate rounded-lg px-1 py-1 text-center font-sans text-[11px] font-semibold", onAir ? "bg-pgm text-pgm-foreground" : "bg-secondary text-foreground")} title={name}>{name}</div>
      <div className="flex min-h-0 flex-1 gap-2 py-1" style={{ minHeight: 110 }}>
        <div className="flex gap-[2px]"><Meter level={level} /><Meter level={level && { rms: level.rms * 0.96, peak: level.peak * 0.97 }} /></div>
        <div className="relative flex flex-1 justify-center">
          <input
            type="range" min={0} max={1000} value={Math.round(ch.fader * 1000)}
            onChange={(e) => onChange({ fader: Number(e.target.value) / 1000 })}
            onDoubleClick={() => onChange({ fader: 0.75 })}
            className="fader" aria-label={`Fader ${name}`} aria-valuetext={`${formatDb(db)} decibéis`}
          />
        </div>
      </div>
      <div className={cn("text-center font-mono text-[10px] tabular-nums", db > 0 ? "text-warn" : "text-muted-foreground")}>{formatDb(db)} dB</div>
      <Btn tone="mute" on={ch.mute} onClick={() => onChange({ mute: !ch.mute })}>MUTAR</Btn>
      {!isBus && (
        <>
          <div className="grid grid-cols-2 gap-1">
            <Btn tone="solo" on={ch.solo} onClick={() => onChange({ solo: !ch.solo })}>S</Btn>
            <Btn tone="afv" on={ch.afv} onClick={() => onChange({ afv: !ch.afv })}>AFV</Btn>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <span title="Saída principal" className="flex h-6 items-center justify-center rounded-md border border-primary/40 bg-primary/15 text-[10px] font-semibold text-primary">M</span>
            <Btn tone="bus" on={ch.a1} onClick={() => onChange({ a1: !ch.a1 })}>A1</Btn>
            <Btn tone="bus" on={ch.a2} onClick={() => onChange({ a2: !ch.a2 })}>A2</Btn>
          </div>
        </>
      )}
    </div>
  );
}
