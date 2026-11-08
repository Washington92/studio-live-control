/** Optional WMix desktop bridge. Browser preview remains fully functional without it. */
export type NativeEngineEvent =
  | { type: "ready" }
  | { type: "offline"; reason: string };

export interface NativeEngineBridge {
  status(): Promise<{ ready: boolean }>;
  command(name: "STATUS" | "CUT"): Promise<string>;
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
