import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Broadcast Studio — Switcher e Mixer de Vídeo Profissional" },
      { name: "description", content: "Switcher de produção ao vivo com PVW/PGM, T-Bar, DSK, matriz de entradas e mixer de áudio multicanal." },
      { property: "og:title", content: "Broadcast Studio — Switcher e Mixer de Vídeo" },
      { property: "og:description", content: "Produção ao vivo profissional no navegador: transições, overlays, áudio e gravação." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});
