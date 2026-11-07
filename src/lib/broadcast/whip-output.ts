/** Browser-native WHIP (RFC 9725) publisher for the existing Program A/V stream.
 * WHIP is WebRTC ingest, not RTMP/RTMPS. No stream credentials are persisted.
 */
export function validateWhipEndpoint(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); }
  catch { throw new Error("Informe uma URL WHIP HTTPS válida."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("O endereço WHIP deve usar HTTPS, sem usuário, senha ou fragmento.");
  }
  return url.toString();
}

export function resolveWhipSessionLocation(endpoint: string, location: string | null): string {
  if (!location) throw new Error("O servidor WHIP não retornou o endereço da sessão (Location).");
  const session = new URL(location, endpoint);
  if (session.protocol !== "https:" || session.origin !== new URL(endpoint).origin) {
    throw new Error("O servidor WHIP retornou uma sessão em outra origem.");
  }
  return session.toString();
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Tempo esgotado na coleta de candidatos ICE.")), 15000);
    function finish(error?: Error) {
      pc.removeEventListener("icegatheringstatechange", check);
      window.clearTimeout(timeout);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (pc.iceGatheringState === "complete") finish();
      else if (pc.connectionState === "closed") finish(new Error("Conexão WHIP interrompida."));
    }
    pc.addEventListener("icegatheringstatechange", check);
    check();
  });
}

function waitForPeerConnected(pc: RTCPeerConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Tempo esgotado ao conectar ao servidor WHIP.")), 20000);
    function finish(error?: Error) {
      pc.removeEventListener("connectionstatechange", check);
      window.clearTimeout(timeout);
      if (error) reject(error); else resolve();
    }
    function check() {
      if (pc.connectionState === "connected") finish();
      else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        finish(new Error("A conexão WebRTC ao servidor WHIP falhou."));
      }
    }
    pc.addEventListener("connectionstatechange", check);
    check();
  });
}

export class WhipPublisher {
  private pc: RTCPeerConnection | null = null;
  private sessionUrl: string | null = null;
  private token = "";
  private active = false;

  constructor(private readonly onDisconnect?: () => void) {}

  async start(stream: MediaStream, rawEndpoint: string, bearerToken = ""): Promise<void> {
    if (this.pc) throw new Error("Já existe uma transmissão iniciada.");
    const endpoint = validateWhipEndpoint(rawEndpoint);
    if (!stream.getVideoTracks().length) throw new Error("Program sem vídeo para transmitir.");
    if (typeof RTCPeerConnection === "undefined") throw new Error("Este navegador não suporta WebRTC.");

    const pc = new RTCPeerConnection();
    this.pc = pc;
    this.token = bearerToken.trim();
    try {
      for (const track of stream.getTracks()) pc.addTransceiver(track, { direction: "sendonly" });
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIceGathering(pc);
      const headers: Record<string, string> = { "Content-Type": "application/sdp" };
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      const response = await fetch(endpoint, {
        method: "POST", headers, body: pc.localDescription?.sdp ?? offer.sdp ?? "",
        credentials: "omit", redirect: "error",
      });
      if (response.status !== 201) throw new Error(`Servidor WHIP rejeitou a transmissão (HTTP ${response.status}).`);
      this.sessionUrl = resolveWhipSessionLocation(endpoint, response.headers.get("Location"));
      const answer = await response.text();
      if (!answer) throw new Error("O servidor WHIP retornou uma resposta SDP vazia.");
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
      await waitForPeerConnected(pc);
      this.active = true;
      pc.addEventListener("connectionstatechange", () => {
        if (this.active && this.pc === pc && pc.connectionState === "failed") this.onDisconnect?.();
      });
    } catch (error) {
      await this.stop();
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.active = false;
    const pc = this.pc;
    this.pc = null;
    const session = this.sessionUrl;
    this.sessionUrl = null;
    const token = this.token;
    this.token = "";
    pc?.close();
    if (session) {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        await fetch(session, { method: "DELETE", headers, credentials: "omit", redirect: "error" });
      } catch { /* Network loss may prevent DELETE; peer connection is already closed. */ }
    }
  }
}
