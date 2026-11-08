import React from "react";
import { createRoot } from "react-dom/client";
import { Studio } from "../../src/components/studio/Studio";
import "../../src/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("WMix renderer root missing");
createRoot(root).render(<React.StrictMode><Studio /></React.StrictMode>);
