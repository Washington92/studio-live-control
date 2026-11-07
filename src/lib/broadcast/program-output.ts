import { dbToGain, faderToDb } from "./audio";
import type { Input } from "./render";

export interface OutputChannel {
  fader: number;
  mute: boolean;
  solo: boolean;
  afv: boolean;
}

export interface ProgramMix {
  inputs: Input[];
  channels: Record<string, OutputChannel>;
  master: Pick<OutputChannel, "fader" | "mute">;
  programId: string;
  previewId: string;
  transition: number;
  fadeToBlack: number;
}

export function sourceOutputGain(mix: ProgramMix, inputId: string): number {
  const channel = mix.channels[inputId];
  if (!channel || channel.mute) return 0;
  if (Object.values(mix.channels).some((other) => other.solo) && !channel.solo) return 0;
  const progress = Math.max(0, Math.min(1, mix.transition));
  let gate = 1;
  if (channel.afv) {
    gate = inputId === mix.programId
      ? (mix.programId === mix.previewId ? 1 : 1 - progress)
      : inputId === mix.previewId ? progress : 0;
  }
  return dbToGain(faderToDb(channel.fader)) * gate;
}

interface AudioRoute {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

/** Browser-native output bus: the rendered PGM canvas plus a real Web Audio master mix. */
export class ProgramOutputEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private stream: MediaStream | null = null;
  private routes = new Map<string, AudioRoute>();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly fps = 30) {}

  start(): MediaStream {
    if (this.stream) throw new Error("Saída Program já iniciada");
    if (typeof AudioContext === "undefined" || typeof MediaStream === "undefined") {
      throw new Error("O navegador não oferece os recursos de áudio necessários");
    }
    const context = new AudioContext();
    const destination = context.createMediaStreamDestination();
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(destination);
    try {
      const video = this.canvas.captureStream(this.fps);
      if (!video.getVideoTracks().length) throw new Error("Program sem faixa de vídeo");
      const stream = new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
      this.context = context;
      this.master = master;
      this.stream = stream;
      void context.resume().catch(() => {});
      return stream;
    } catch (error) {
      master.disconnect();
      void context.close().catch(() => {});
      throw error;
    }
  }

  update(mix: ProgramMix): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;

    const activeIds = new Set<string>();
    for (const input of mix.inputs) {
      const stream = input.stream;
      if (!stream || !stream.getAudioTracks().some((track) => track.readyState === "live")) continue;
      activeIds.add(input.id);
      const previous = this.routes.get(input.id);
      if (previous && previous.stream !== stream) this.disconnect(input.id);
      let route = this.routes.get(input.id);
      if (!route) {
        try {
          const source = context.createMediaStreamSource(stream);
          const gain = context.createGain();
          gain.gain.value = 0;
          source.connect(gain);
          gain.connect(master);
          route = { stream, source, gain };
          this.routes.set(input.id, route);
        } catch {
          continue;
        }
      }
      route.gain.gain.setTargetAtTime(sourceOutputGain(mix, input.id), context.currentTime, 0.015);
    }
    for (const id of this.routes.keys()) {
      if (!activeIds.has(id)) this.disconnect(id);
    }
    const masterGain = mix.master.mute ? 0 : dbToGain(faderToDb(mix.master.fader));
    master.gain.setTargetAtTime(masterGain * (1 - Math.max(0, Math.min(1, mix.fadeToBlack))), context.currentTime, 0.015);
  }

  stop(): void {
    for (const id of this.routes.keys()) this.disconnect(id);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.master?.disconnect();
    const context = this.context;
    this.stream = null;
    this.master = null;
    this.context = null;
    if (context && context.state !== "closed") void context.close().catch(() => {});
  }

  private disconnect(id: string): void {
    const route = this.routes.get(id);
    if (!route) return;
    route.source.disconnect();
    route.gain.disconnect();
    this.routes.delete(id);
  }
}
