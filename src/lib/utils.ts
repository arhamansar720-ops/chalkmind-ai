import { twMerge } from "tailwind-merge";

/** Current time in ms. A function (not inline Date.now()) so event handlers stay lint-clean. */
export const now = () => Date.now();

/** Join class names; later Tailwind utilities override conflicting earlier ones. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(parts.filter(Boolean).join(" "));
}

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: d > 300 ? "numeric" : undefined });
}

/** Markdown + TeX → something a speech engine can read aloud. */
export function speakableText(md: string): string {
  return md
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) => texToSpeech(tex))
    .replace(/\$([^$\n]+?)\$/g, (_, tex: string) => texToSpeech(tex))
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function texToSpeech(tex: string): string {
  return tex
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 over $2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "the square root of $1")
    .replace(/\^\{?2\}?/g, " squared")
    .replace(/\^\{?3\}?/g, " cubed")
    .replace(/\^\{([^{}]+)\}/g, " to the power of $1")
    .replace(/\^(\w)/g, " to the power of $1")
    .replace(/_\{?([^{}\s]+)\}?/g, " sub $1")
    .replace(/\\(times|cdot)/g, " times ")
    .replace(/\\div/g, " divided by ")
    .replace(/\\pm/g, " plus or minus ")
    .replace(/\\(le|leq)/g, " is less than or equal to ")
    .replace(/\\(ge|geq)/g, " is greater than or equal to ")
    .replace(/\\neq/g, " is not equal to ")
    .replace(/\\approx/g, " is approximately ")
    .replace(/\\pi/g, " pi ")
    .replace(/\\theta/g, " theta ")
    .replace(/\\(left|right|,|;|!|quad)/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/(?<=\s|^)-(?=\s|\d|\w)/g, " minus ")
    .replace(/\s+/g, " ")
    .trim();
}

export function downloadText(filename: string, text: string, mime = "text/markdown") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chalkmind";
}

/** Read an image file and downscale it so uploads stay small (longest side ≤ maxSide). */
export async function imageFileToDataUrl(file: File, maxSide = 1600): Promise<string> {
  if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) throw new Error("Use a PNG, JPEG, WEBP or GIF image.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Images must be 15 MB or smaller.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That image couldn't be opened."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Image processing isn't available in this browser.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}
