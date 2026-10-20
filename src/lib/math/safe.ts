import { all, create } from "mathjs";

/**
 * A locked-down mathjs instance. Following mathjs' security guidance, the
 * functions that could reach the parser or mutate the instance from inside an
 * expression are disabled, so model-supplied expressions can only compute.
 */
const math = create(all, { number: "number" });
const evaluateFn = math.evaluate.bind(math);
const compileFn = math.compile.bind(math);

const blocked = () => {
  throw new Error("Function disabled");
};
math.import(
  {
    import: blocked,
    createUnit: blocked,
    evaluate: blocked,
    parse: blocked,
    compile: blocked,
    simplify: blocked,
    derivative: blocked,
    resolve: blocked,
    reviver: blocked,
  },
  { override: true },
);

const MAX_LEN = 240;
/** Letters (variables / functions), digits, operators, brackets, commas, dots, spaces. */
const SAFE_CHARS = /^[A-Za-z0-9_+\-*/^().,\s=<>!%]*$/;

export function isSafeExpression(expr: string): boolean {
  return expr.length > 0 && expr.length <= MAX_LEN && SAFE_CHARS.test(expr);
}

export function safeCompile(expr: string): { evaluate: (scope?: Record<string, number>) => unknown } {
  if (!isSafeExpression(expr)) throw new Error("Expression contains unsupported characters");
  return compileFn(expr);
}

export function safeEvaluate(expr: string, scope: Record<string, number> = {}): number {
  if (!isSafeExpression(expr)) throw new Error("Expression contains unsupported characters");
  const v = evaluateFn(expr, { ...scope });
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v && typeof v === "object" && "re" in v && "im" in v) {
    const c = v as { re: number; im: number };
    if (Math.abs(c.im) < 1e-12) return c.re;
  }
  throw new Error("Expression did not produce a real number");
}

export function approxEqual(a: number, b: number, rel = 1e-6): boolean {
  return Math.abs(a - b) <= rel * Math.max(1, Math.abs(a), Math.abs(b));
}
