import { approxEqual, safeEvaluate } from "../math/safe";
import type { Check, HomeworkSolution, Verification } from "./schema";

/**
 * Independently checks the model's answer where that is mechanically
 * possible (substituting a solution back into an equation, or recomputing a
 * numeric result). Anything else is reported as "not independently
 * verified" — we never claim verification we didn't perform.
 */
export function runCheck(check: Check): { ok: boolean; detail: string } {
  try {
    if (check.kind === "substitute") {
      const sides = check.equation.split(/(?<![<>!=])=(?!=)/);
      if (sides.length !== 2) return { ok: false, detail: `Could not read "${check.equation}" as one equation.` };
      const [l, r] = sides.map((s) => safeEvaluate(s.trim(), check.values));
      const vals = Object.entries(check.values)
        .map(([k, v]) => `${k} = ${fmt(v)}`)
        .join(", ");
      const ok = approxEqual(l, r);
      return {
        ok,
        detail: ok
          ? `Substituting ${vals} into ${check.equation}: both sides equal ${fmt(l)}.`
          : `Substituting ${vals} into ${check.equation} gives ${fmt(l)} ≠ ${fmt(r)}.`,
      };
    }
    const v = safeEvaluate(check.expression);
    const ok = approxEqual(v, check.expected, 1e-4);
    return {
      ok,
      detail: ok
        ? `Recomputed ${check.expression} = ${fmt(v)}, matching the answer.`
        : `Recomputed ${check.expression} = ${fmt(v)}, but the answer says ${fmt(check.expected)}.`,
    };
  } catch (err) {
    return { ok: false, detail: `Check could not run: ${err instanceof Error ? err.message : "error"}.` };
  }
}

export function verifySolution(solution: HomeworkSolution): Verification {
  if (solution.checks.length === 0) {
    return { status: "unverified", reason: "This answer can't be checked automatically. Review the reasoning steps." };
  }
  const results = solution.checks.map(runCheck);
  const ran = results.filter((r) => !r.detail.startsWith("Check could not run") && !r.detail.startsWith("Could not read"));
  if (ran.length === 0) {
    return { status: "unverified", reason: "An automatic check was attempted but couldn't be evaluated." };
  }
  const method = solution.checks.some((c) => c.kind === "substitute") ? "Substitution check" : "Recalculation";
  if (results.every((r) => r.ok)) return { status: "verified", method, details: results.map((r) => r.detail) };
  return { status: "failed", method, details: results.map((r) => r.detail) };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : Number(n.toPrecision(8)).toString();
}
