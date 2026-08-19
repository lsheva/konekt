import { createRoot } from "react-dom/client";
import "konekt-ui/styles.css";
import { App } from "./App";
import "./styles.css";

const el = document.getElementById("root");
if (!el) {
  throw new Error("No root element found");
}

createRoot(el).render(<App />);
