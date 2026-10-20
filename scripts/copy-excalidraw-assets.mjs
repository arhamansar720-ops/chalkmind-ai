// Copies Excalidraw's font files into public/ so the whiteboard doesn't load
// fonts from a third-party CDN. Runs on `npm install` (postinstall).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@excalidraw/excalidraw/dist/prod/fonts");
const dest = join(root, "public/excalidraw/fonts");

if (!existsSync(src)) {
  console.warn("[chalkmind] Excalidraw fonts not found; skipping copy.");
} else {
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log("[chalkmind] Copied Excalidraw fonts to public/excalidraw/fonts");
}
