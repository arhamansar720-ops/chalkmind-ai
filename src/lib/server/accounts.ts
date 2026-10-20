import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http-error";
import { dummyHash, hashPassword, PASSWORD_MAX, PASSWORD_MIN, verifyPassword } from "./password";
import type { SessionUser } from "./session";

export const signUpSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(PASSWORD_MAX),
  name: z.string().trim().max(60).optional(),
  code: z.string().max(200).optional(),
});
export const signInSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

const WINDOW = "15 minutes";
const MAX_PER_EMAIL = 8;
const MAX_PER_IP = 40;

const sha = (s: string) => createHash("sha256").update(s).digest();

/** SIGNUP_CODE, when set, is an invite code required to create an account. */
export function checkInviteCode(code: string | undefined): void {
  const expected = process.env.SIGNUP_CODE?.trim();
  if (!expected) return;
  if (!code || !timingSafeEqual(sha(code.trim()), sha(expected))) {
    throw new HttpError(403, "invite_required", "That invite code isn't right.", "Ask whoever runs this Chalkmind for the invite code.");
  }
}

export async function createUser(input: z.infer<typeof signUpSchema>): Promise<SessionUser> {
  checkInviteCode(input.code);
  const hash = await hashPassword(input.password);
  try {
    const [row] = await db()<SessionUser[]>`
      insert into users (email, name, password_hash) values (${input.email.trim()}, ${input.name || null}, ${hash})
      returning id, email, name`;
    return row;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new HttpError(409, "email_taken", "An account with this email already exists. Sign in instead.");
    throw err;
  }
}

export async function authenticate(email: string, password: string, ip: string): Promise<SessionUser> {
  const sql = db();
  const lower = email.trim().toLowerCase();
  const [{ by_email, by_ip }] = await sql<{ by_email: number; by_ip: number }[]>`
    select
      count(*) filter (where email_lower = ${lower})::int as by_email,
      count(*) filter (where ip = ${ip})::int as by_ip
    from auth_failures where at > now() - ${WINDOW}::interval and (email_lower = ${lower} or ip = ${ip})`;
  if (by_email >= MAX_PER_EMAIL || by_ip >= MAX_PER_IP) {
    throw new HttpError(429, "rate_limited", "Too many sign-in attempts. Wait 15 minutes and try again.");
  }
  const [user] = await sql<(SessionUser & { password_hash: string })[]>`
    select id, email, name, password_hash from users where lower(email) = ${lower}`;
  const ok = await verifyPassword(password, user?.password_hash ?? (await dummyHash()));
  if (!user || !ok) {
    await sql`insert into auth_failures (email_lower, ip) values (${lower}, ${ip})`;
    await sql`delete from auth_failures where at < now() - interval '1 day'`;
    throw new HttpError(401, "bad_credentials", "Email or password is incorrect.");
  }
  await sql`delete from auth_failures where email_lower = ${lower}`;
  return { id: user.id, email: user.email, name: user.name };
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
