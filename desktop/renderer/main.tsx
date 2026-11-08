import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
const Studio = React.lazy(() =>
  import("../../src/components/studio/Studio").then((module) => ({ default: module.Studio }))
);
import "../../src/styles.css";

class DesktopErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message || "Erro desconhecido" };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[WMix Desktop] React failed:", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <main role="alert" style={{ padding: 32, color: "#fff", background: "#161a22", minHeight: "100vh", fontFamily: "system-ui" }}>
          <h1>WMix — Erro ao carregar o estúdio</h1>
          <p>Reinicie o aplicativo. Se persistir, envie esta mensagem para o suporte:</p>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{this.state.error}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}

function StudioReadyMarker() {
  useEffect(() => {
    document.documentElement.dataset.wmixStudioReady = "true";
    return () => { delete document.documentElement.dataset.wmixStudioReady; };
  }, []);
  return null;
}

function DesktopStudio() {
  return (
    <React.Suspense fallback={<div role="status" style={{ padding: 24 }}>Inicializando WMix Studio…</div>}>
      <Studio />
      <StudioReadyMarker />
    </React.Suspense>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("WMix renderer root missing");
createRoot(root).render(
  <React.StrictMode>
    <DesktopErrorBoundary><DesktopStudio /></DesktopErrorBoundary>
  </React.StrictMode>
);
