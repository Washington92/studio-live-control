/** Serializes transition requests. Never assumes that a native CUT succeeded. */
export type TransitionPhase = "idle" | "pending" | "confirmed" | "error";
export type TransitionSnapshot = { phase: TransitionPhase; message: string; updatedAt: number };
export class TransitionGuard {
  private busy = false;
  private snapshot: TransitionSnapshot = { phase: "idle", message: "", updatedAt: 0 };
  get state(): TransitionSnapshot { return { ...this.snapshot }; }
  get locked(): boolean { return this.busy; }

  async execute(action: () => Promise<void>, onState?: (state: TransitionSnapshot) => void): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.set("pending", "Transição em andamento", onState);
    try {
      await action();
      this.set("confirmed", "Transição confirmada", onState);
      return true;
    } catch (error) {
      this.set("error", error instanceof Error ? error.message : "Falha na transição", onState);
      return false;
    } finally {
      this.busy = false;
    }
  }
  reset(onState?: (state: TransitionSnapshot) => void): void {
    if (this.busy) return;
    this.set("idle", "", onState);
  }
  private set(phase: TransitionPhase, message: string, onState?: (state: TransitionSnapshot) => void) {
    this.snapshot = { phase, message, updatedAt: Date.now() };
    onState?.(this.state);
  }
}
