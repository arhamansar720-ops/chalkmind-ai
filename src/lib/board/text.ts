/**
 * Board text elements are plain text, but models often slip TeX into labels
 * ("$b^2$", "\\theta"). Convert the common cases to readable Unicode so the
 * board never shows raw markup. Full equations belong in add_equation.
 */

const SUP: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ", x: "ˣ", y: "ʸ", a: "ᵃ", b: "ᵇ", c: "ᶜ", k: "ᵏ", m: "ᵐ", t: "ᵗ",
};
const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", a: "ₐ", e: "ₑ", i: "ᵢ", n: "ₙ", o: "ₒ", x: "ₓ", k: "ₖ", m: "ₘ", t: "ₜ",
};

const SYMBOLS: [RegExp, string][] = [
  [/\\(?:times)\b/g, "×"],
  [/\\cdot\b/g, "·"],
  [/\\div\b/g, "÷"],
  [/\\pm\b/g, "±"],
  [/\\mp\b/g, "∓"],
  [/\\(?:leq|le)\b/g, "≤"],
  [/\\(?:geq|ge)\b/g, "≥"],
  [/\\(?:neq|ne)\b/g, "≠"],
  [/\\approx\b/g, "≈"],
  [/\\infty\b/g, "∞"],
  [/\\(?:rightarrow|to)\b/g, "→"],
  [/\\leftarrow\b/g, "←"],
  [/\\Rightarrow\b/g, "⇒"],
  [/\\(?:circ|degree)\b/g, "°"],
  [/\\angle\b/g, "∠"],
  [/\\triangle\b/g, "△"],
  [/\\perp\b/g, "⊥"],
  [/\\parallel\b/g, "∥"],
  [/\\sum\b/g, "Σ"],
  [/\\int\b/g, "∫"],
  [/\\partial\b/g, "∂"],
  [/\\alpha\b/g, "α"],
  [/\\beta\b/g, "β"],
  [/\\gamma\b/g, "γ"],
  [/\\delta\b/g, "δ"],
  [/\\Delta\b/g, "Δ"],
  [/\\theta\b/g, "θ"],
  [/\\lambda\b/g, "λ"],
  [/\\mu\b/g, "μ"],
  [/\\pi\b/g, "π"],
  [/\\sigma\b/g, "σ"],
  [/\\omega\b/g, "ω"],
  [/\\Omega\b/g, "Ω"],
  [/\\phi\b/g, "φ"],
];

const mapChars = (s: string, table: Record<string, string>) =>
  [...s].every((c) => table[c]) ? [...s].map((c) => table[c]).join("") : null;

export function texToUnicode(input: string): string {
  if (!/[\\$^_]/.test(input)) return input;
  let s = input.replace(/\$\$?([^$]*)\$\$?/g, "$1");
  s = s.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "($1)/($2)").replace(/\((\w)\)\/\((\w)\)/g, "$1/$2");
  s = s.replace(/\\sqrt\{([^{}]+)\}/g, (_, a: string) => (a.length === 1 ? `√${a}` : `√(${a})`));
  s = s.replace(/\\text\{([^{}]*)\}|\\mathrm\{([^{}]*)\}/g, (_, a?: string, b?: string) => a ?? b ?? "");
  s = s.replace(/\^\{?\\circ\}?/g, "°");
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  s = s.replace(/\^\{([^{}]+)\}|\^(\S)/g, (m, a?: string, b?: string) => mapChars(a ?? b ?? "", SUP) ?? `^${a ?? b}`);
  s = s.replace(/_\{([^{}]+)\}|_([A-Za-z0-9])/g, (m, a?: string, b?: string) => mapChars(a ?? b ?? "", SUB) ?? m);
  s = s.replace(/\\left|\\right|\\,|\\;|\\!|\\quad/g, " ").replace(/\\([{}])/g, "$1");
  return s.replace(/[ \t]{2,}/g, " ").trim();
}
