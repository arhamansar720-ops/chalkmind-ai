/**
 * Renders TeX to a standalone SVG (MathJax, glyphs as paths — no web fonts
 * needed) so equations can be placed on the board as images. Loaded lazily:
 * MathJax is only fetched the first time a lesson needs an equation.
 */

export interface RenderedEquation {
  svg: string;
  width: number;
  height: number;
}

type Converter = (latex: string) => RenderedEquation;
let converterPromise: Promise<Converter> | null = null;

const EX_TO_PX = 11.5; // board equations read at roughly a 24px font size
const INK = "#1e1e24";

async function loadConverter(): Promise<Converter> {
  const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }, ams] = await Promise.all([
    import("mathjax-full/js/mathjax.js"),
    import("mathjax-full/js/input/tex.js"),
    import("mathjax-full/js/output/svg.js"),
    import("mathjax-full/js/adaptors/liteAdaptor.js"),
    import("mathjax-full/js/handlers/html.js"),
    import("mathjax-full/js/input/tex/ams/AmsConfiguration.js"),
  ]);
  await import("mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js");
  await import("mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js");
  void ams;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document("", {
    InputJax: new TeX({ packages: ["base", "ams", "newcommand", "noundefined"] }),
    OutputJax: new SVG({ fontCache: "none" }),
  });

  return (latex: string) => {
    const node = doc.convert(latex, { display: true });
    let svg = adaptor.innerHTML(node);
    if (/data-mjx-error|merror/.test(svg)) throw new Error("TeX error");
    const w = parseFloat(/width="([\d.]+)ex"/.exec(svg)?.[1] ?? "0");
    const h = parseFloat(/height="([\d.]+)ex"/.exec(svg)?.[1] ?? "0");
    if (!w || !h) throw new Error("Could not size equation");
    const width = Math.round(w * EX_TO_PX);
    const height = Math.round(h * EX_TO_PX);
    svg = svg
      .replace(/width="[\d.]+ex"/, `width="${width}"`)
      .replace(/height="[\d.]+ex"/, `height="${height}"`)
      .replace(/style="[^"]*"/, `style="color:${INK}"`)
      .replace(/currentColor/g, INK);
    if (!svg.includes('xmlns="http://www.w3.org/2000/svg"')) {
      svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return { svg, width, height };
  };
}

export async function renderEquation(latex: string): Promise<RenderedEquation> {
  converterPromise ??= loadConverter();
  const convert = await converterPromise;
  return convert(latex);
}

export function svgToDataURL(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/** Stable short hash (FNV-1a) so the same equation reuses one board file. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
