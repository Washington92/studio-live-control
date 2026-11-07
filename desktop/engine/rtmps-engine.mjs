import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Native RTMPS output worker (Node.js, Windows-ready).
 * Receives a live WebM stream on stdin; FFmpeg converts VP8/VP9+Opus to H.264+AAC.
 * Does not depend on OBS or an external RTMP server.
 * The Windows packaging stage will bundle a licensed FFmpeg build.
 */
export function validateRtmpsUrl(raw) {
  if (typeof raw !== "string" || raw.length > 2048) throw new Error("Endereço RTMPS inválido.");
  let url;
  try { url = new URL(raw); } catch { throw new Error("Endereço RTMPS inválido."); }
  if (url.protocol !== "rtmps:" || !url.hostname || url.username || url.password || url.hash) {
    throw new Error("Use um destino rtmps:// válido, sem credenciais na URL.");
  }
  if (url.search) throw new Error("Não inclua parâmetros de consulta no destino RTMPS.");
  return url.toString();
}

export function buildFfmpegArgs(destination, bitrateKbps = 4500) {
  const url = validateRtmpsUrl(destination);
  if (!Number.isInteger(bitrateKbps) || bitrateKbps < 500 || bitrateKbps > 20000) {
    throw new Error("Bitrate de vídeo deve estar entre 500 e 20000 kbps.");
  }
  return [
    "-hide_banner", "-nostdin", "-loglevel", "warning",
    "-fflags", "+genpts", "-f", "webm", "-i", "pipe:0",
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-tune", "zerolatency",
    "-pix_fmt", "yuv420p", "-r", "30", "-g", "60",
    "-b:v", `${bitrateKbps}k`, "-maxrate", `${bitrateKbps}k`,
    "-bufsize", `${bitrateKbps * 2}k`,
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-f", "flv", url,
  ];
}

export function redactSecrets(message, destination) {
  if (!destination) return String(message);
  const url = new URL(destination);
  const secret = url.pathname.replace(/^\/+/, "");
  let clean = String(message).split(destination).join("[destino RTMPS oculto]");
  if (secret) clean = clean.split(secret).join("[chave oculta]");
  return clean;
}

export async function createRtmpsSession({ ffmpegPath, destination, bitrateKbps = 4500, source, onDiagnostic = () => {} }) {
  if (!source || typeof source.pipe !== "function") throw new Error("Fonte de vídeo WebM inválida.");
  const executable = resolve(ffmpegPath);
  await access(executable, constants.F_OK);
  const args = buildFfmpegArgs(destination, bitrateKbps);
  const child = spawn(executable, args, {
    windowsHide: true,
    stdio: ["pipe", "ignore", "pipe"],
    shell: false,
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + redactSecrets(chunk, destination)).slice(-4096);
    onDiagnostic(stderr);
  });
  source.pipe(child.stdin);
  const completion = new Promise((resolveCompletion, rejectCompletion) => {
    child.once("error", (error) => rejectCompletion(new Error(`Falha ao iniciar encoder: ${error.code ?? "desconhecida"}`)));
    child.once("close", (code) => {
      source.unpipe(child.stdin);
      if (code === 0) resolveCompletion({ code: 0 });
      else rejectCompletion(new Error(`Encoder encerrou (código ${code ?? "desconhecido"}). ${stderr}`));
    });
  });
  child.stdin.on("error", (error) => {
    if (error.code !== "EPIPE" && error.code !== "ERR_STREAM_DESTROYED") {
      onDiagnostic(`Falha no envio de vídeo ao encoder: ${error.code ?? "desconhecida"}`);
    }
  });
  return {
    completion,
    stop: async () => {
      source.unpipe(child.stdin);
      child.stdin.end();
      return completion;
    },
  };
}

async function main() {
  const destination = process.env.WMIX_RTMPS_URL;
  const ffmpegPath = process.env.WMIX_FFMPEG_PATH;
  const bitrateKbps = Number(process.env.WMIX_VIDEO_BITRATE_KBPS ?? "4500");
  if (!destination || !ffmpegPath) {
    throw new Error("Configure WMIX_RTMPS_URL e WMIX_FFMPEG_PATH no processo local.");
  }
  const session = await createRtmpsSession({
    destination, ffmpegPath, bitrateKbps, source: process.stdin,
    onDiagnostic: (message) => { process.stderr.write(`\r${message}\n`); },
  });
  process.stderr.write("wMix: encoder iniciado; aguardando dados WebM.\n");
  await session.completion;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`wMix: ${error.message}\n`);
    process.exitCode = 1;
  });
}
