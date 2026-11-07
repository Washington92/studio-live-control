import { dbToMeter, faderToDb, formatDb, gainToDb } from "@/lib/broadcast/audio";
import { cn } from "@/lib/utils";

export interface Channel { fader: number; mute: boolean; solo: boolean; afv: boolean; a1: boolean; a2: boolean }
export interface Level { rms: number; peak: number }

export function Meter({ level, className }: { level?: Level; className?: string }) {
  const rms = dbToMeter(gainToDb(level?.rms ?? 0));
  const peak = dbToMeter(gainToDb(level?.peak ?? 0));
  return (
    <div className={cn("relative w-2 overflow-hidden rounded-[1px] bg-meter-bg", className)}>
      <div className="absolute inset-x-0 bottom-0 bg-meter" style={{ height: `${rms * 100}%`, backgroundSize: "100% var(--meter-h, 160px)" }} />
      <div className="absolute inset-x-0 h-[2px] bg-foreground" style={{ bottom: `${peak * 100}%` }} />
      <div className="absolute inset-x-0 h-px bg-pgm/70" style={{ bottom: `${dbToMeter(0) * 100}%` }} />
    </div>
  );
}

function Btn({ on, onClick, children, tone }: { on: boolean; onClick: () => void; children: React.ReactNode; tone: "mute" | "solo" | "afv" | "bus" }) {
  const toneCls = { mute: "bg-pgm text-pgm-foreground", solo: "bg-warn text-warn-foreground", afv: "bg-pvw text-pvw-foreground", bus: "bg-primary text-primary-foreground" }[tone];
  return (
    <button onClick={onClick} className={cn("h-5 w-full rounded-sm border border-border font-mono text-[9px] font-bold tracking-wider", on ? toneCls : "bg-secondary text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

export function Strip({ name, ch, level, onAir, onChange, isBus }: {
  name: string; ch: Channel; level?: Level; onAir?: boolean; isBus?: boolean;
  onChange: (c: Partial<Channel>) => void;
}) {
  const db = faderToDb(ch.fader);
  return (
    <div className={cn("flex w-[78px] shrink-0 flex-col gap-1 rounded-sm border bg-panel p-1.5", onAir ? "border-pgm" : "border-border", isBus && "bg-panel-strong")}>
      <div className={cn("truncate rounded-sm px-1 text-center font-mono text-[10px] font-semibold", onAir ? "bg-pgm text-pgm-foreground" : "bg-secondary text-foreground")} title={name}>{name}</div>
      <div className="flex flex-1 gap-1.5 py-1" style={{ minHeight: 120 }}>
        <div className="flex gap-[2px]"><Meter level={level} /><Meter level={level && { rms: level.rms * 0.96, peak: level.peak * 0.97 }} /></div>
        <div className="relative flex flex-1 justify-center">
          <input
            type="range" min={0} max={1000} value={Math.round(ch.fader * 1000)}
            onChange={(e) => onChange({ fader: Number(e.target.value) / 1000 })}
            onDoubleClick={() => onChange({ fader: 0.75 })}
            className="fader" aria-label={`Fader ${name}`}
          />
        </div>
      </div>
      <div className={cn("text-center font-mono text-[10px]", db > 0 ? "text-warn" : "text-muted-foreground")}>{formatDb(db)} dB</div>
      <Btn tone="mute" on={ch.mute} onClick={() => onChange({ mute: !ch.mute })}>MUTE</Btn>
      {!isBus && (
        <>
          <div className="grid grid-cols-2 gap-1">
            <Btn tone="solo" on={ch.solo} onClick={() => onChange({ solo: !ch.solo })}>S</Btn>
            <Btn tone="afv" on={ch.afv} onClick={() => onChange({ afv: !ch.afv })}>AFV</Btn>
          </div>
          <div className="grid grid-cols-3 gap-1">
            <Btn tone="bus" on onClick={() => {}}>M</Btn>
            <Btn tone="bus" on={ch.a1} onClick={() => onChange({ a1: !ch.a1 })}>A1</Btn>
            <Btn tone="bus" on={ch.a2} onClick={() => onChange({ a2: !ch.a2 })}>A2</Btn>
          </div>
        </>
      )}
    </div>
  );
}
