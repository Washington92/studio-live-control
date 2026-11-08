/** Optional WMix desktop bridge. Browser preview remains fully functional without it. */
export type NativeEngineEvent =
  | { type: "ready" }
  | { type: "offline"; reason: string };

export interface NativeEngineBridge {
  status(): Promise<{ ready: boolean }>;
  restart?(): Promise<{ restarted: boolean; reason?: string }>;
  command(name: "STATUS" | "CUT" | "ADD_TEST_SOURCE" | "SOURCE_STATUS" | "PROGRAM_SOURCE_STATUS"): Promise<string>;
  onEvent(callback: (event: NativeEngineEvent) => void): () => void;
}

declare global {
  interface Window {
    wmixNative?: NativeEngineBridge;
  }
}

export function nativeEngine(): NativeEngineBridge | null {
  if (typeof window === "undefined") return null;
  return window.wmixNative ?? null;
}

/** Diagnostic only: native scene names do not yet map to WMix input IDs. */
export async function nativeEngineDiagnostics(): Promise<{
  available: boolean;
  ready: boolean;
  scene?: string;
}> {
  const bridge = nativeEngine();
  if (!bridge) return { available: false, ready: false };
  const { ready } = await bridge.status();
  if (!ready) return { available: true, ready: false };
  const scene = await bridge.command("STATUS");
  return { available: true, ready: true, scene };
}

/** Parse the native CLI protocol without treating an ERROR as a successful CUT.
 * This is diagnostic groundwork; the browser is not yet connected to native stdin/stdout.
 */
export type NativeControlResponse =
  | { type: "ready"; version: string }
  | { type: "status"; scene: "PROGRAM" | "PREVIEW" }
  | { type: "cut"; ok: boolean; scene: "PROGRAM" | "PREVIEW" }
  | { type: "error"; message: string }
  | { type: "source"; name: string }
  | { type: "source-status"; present: boolean; name: string }
  | { type: "program-source-status"; present: boolean; name: string }
  | { type: "bye" };

export function parseNativeControlResponse(line: string): NativeControlResponse {
  const message = line.trim();
  if (message === "READY WMIX_OBS_CONTROL_V1") return { type: "ready", version: "WMIX_OBS_CONTROL_V1" };
  if (message === "BYE") return { type: "bye" };
  const programSourceStatus = /^PROGRAM_SOURCE_STATUS (PRESENT|ABSENT) (.+)$/.exec(message);
  if (programSourceStatus) return { type: "program-source-status", present: programSourceStatus[1] === "PRESENT", name: programSourceStatus[2]! };
  const sourceStatus = /^SOURCE_STATUS (PRESENT|ABSENT) (.+)$/.exec(message);
  if (sourceStatus) return { type: "source-status", present: sourceStatus[1] === "PRESENT", name: sourceStatus[2]! };
  if (message.startsWith("OK SOURCE ")) return { type: "source", name: message.slice(10) };
  const status = /^STATUS (PROGRAM|PREVIEW)$/.exec(message);
  if (status) return { type: "status", scene: status[1] as "PROGRAM" | "PREVIEW" };
  const cut = /^(OK|ERROR) CUT (PROGRAM|PREVIEW)$/.exec(message);
  if (cut) return { type: "cut", ok: cut[1] === "OK", scene: cut[2] as "PROGRAM" | "PREVIEW" };
  if (message.startsWith("ERROR ")) return { type: "error", message: message.slice(6) };
  return { type: "error", message: "Resposta nativa desconhecida" };
}
