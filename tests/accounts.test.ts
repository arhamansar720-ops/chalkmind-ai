import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import postgres from "postgres";

// Integration tests against a real Postgres. Run with
//   TEST_DATABASE_URL=postgres://user@localhost:5432/chalkmind_test npm test
// (the database is wiped). Skipped when TEST_DATABASE_URL isn't set.
const URL_ = process.env.TEST_DATABASE_URL;
const d = URL_ ? describe : describe.skip;

const ORIGIN = "http://localhost:3000";
let ip = 0;
function req(path: string, init: { method?: string; body?: unknown; cookie?: string; origin?: string | null } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", host: "localhost:3000", "x-forwarded-for": `10.9.0.${++ip % 250}` };
  if (init.cookie) headers.cookie = init.cookie;
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  return new Request(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
}
const cookieOf = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";

d("accounts and sync (Postgres)", () => {
  let sql: postgres.Sql;
  const routes = {} as {
    signup: typeof import("@/app/api/auth/signup/route");
    signin: typeof import("@/app/api/auth/signin/route");
    signout: typeof import("@/app/api/auth/signout/route");
    me: typeof import("@/app/api/auth/me/route");
    col: typeof import("@/app/api/data/[collection]/route");
    rec: typeof import("@/app/api/data/[collection]/[id]/route");
    sync: typeof import("@/app/api/data/sync/route");
    tutor: typeof import("@/app/api/tutor/route");
  };
  const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_;
    sql = postgres(URL_!, { onnotice: () => {} });
    routes.signup = await import("@/app/api/auth/signup/route");
    routes.signin = await import("@/app/api/auth/signin/route");
    routes.signout = await import("@/app/api/auth/signout/route");
    routes.me = await import("@/app/api/auth/me/route");
    routes.col = await import("@/app/api/data/[collection]/route");
    routes.rec = await import("@/app/api/data/[collection]/[id]/route");
    routes.sync = await import("@/app/api/data/sync/route");
    routes.tutor = await import("@/app/api/tutor/route");
  });
  beforeEach(async () => {
    delete process.env.SIGNUP_CODE;
    delete process.env.REQUIRE_AUTH;
    await sql`truncate users, auth_sessions, auth_failures, records cascade`;
  });
  afterAll(async () => {
    const { resetDb } = await import("@/lib/server/db");
    await resetDb();
    await sql.end();
    delete process.env.DATABASE_URL;
  });

  const signUp = async (email = "ada@example.com", password = "correct horse") => {
    const res = await routes.signup.POST(req("/api/auth/signup", { method: "POST", body: { email, password, name: "Ada" } }));
    return { res, cookie: cookieOf(res) };
  };

  it("signs up, keeps only a hash of the password and session token, and signs out", async () => {
    const { res, cookie } = await signUp();
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toMatch(/HttpOnly; SameSite=Lax/);
    const [u] = await sql`select password_hash from users`;
    expect(u.password_hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(u.password_hash).not.toContain("correct horse");
    const token = cookie.split("=")[1];
    const sessions = await sql`select token_hash from auth_sessions`;
    expect(sessions).toHaveLength(1);
    expect(Buffer.from(sessions[0].token_hash).toString("base64url")).not.toBe(token);

    const me = await (await routes.me.GET(req("/api/auth/me", { cookie }))).json();
    expect(me.user).toMatchObject({ email: "ada@example.com", name: "Ada" });

    expect((await routes.signout.POST(req("/api/auth/signout", { method: "POST", cookie }))).status).toBe(204);
    expect((await (await routes.me.GET(req("/api/auth/me", { cookie }))).json()).user).toBeNull();
  });

  it("rejects duplicate emails (case-insensitive), weak passwords and wrong invite codes", async () => {
    await signUp("Ada@Example.com");
    expect((await signUp("ada@example.com")).res.status).toBe(409);
    expect((await signUp("bob@example.com", "short")).res.status).toBe(400);
    process.env.SIGNUP_CODE = "chalk-2026";
    expect((await signUp("cy@example.com")).res.status).toBe(403);
    const ok = await routes.signup.POST(req("/api/auth/signup", { method: "POST", body: { email: "cy@example.com", password: "long enough pw", code: "chalk-2026" } }));
    expect(ok.status).toBe(201);
  });

  it("signs in with the right password and throttles repeated failures", async () => {
    await signUp();
    const bad = () => routes.signin.POST(req("/api/auth/signin", { method: "POST", body: { email: "ada@example.com", password: "nope nope" } }));
    expect((await bad()).status).toBe(401);
    const good = await routes.signin.POST(req("/api/auth/signin", { method: "POST", body: { email: "ADA@example.com", password: "correct horse" } }));
    expect(good.status).toBe(200);
    expect(cookieOf(good)).toMatch(/^cm_session=/);
    for (let i = 0; i < 8; i++) await bad();
    const locked = await routes.signin.POST(req("/api/auth/signin", { method: "POST", body: { email: "ada@example.com", password: "correct horse" } }));
    expect(locked.status).toBe(429);
    // Unknown email: same error as a wrong password.
    const unknown = await routes.signin.POST(req("/api/auth/signin", { method: "POST", body: { email: "ghost@example.com", password: "whatever1" } }));
    expect((await unknown.json()).error.code).toBe("bad_credentials");
  });

  it("blocks cross-site requests", async () => {
    const res = await routes.signup.POST(req("/api/auth/signup", { method: "POST", origin: "https://evil.example", body: { email: "a@b.co", password: "long enough pw" } }));
    expect(res.status).toBe(403);
  });

  it("stores records per user, last write wins, and syncs deletions", async () => {
    const a = (await signUp("a@example.com")).cookie;
    const b = (await signUp("b@example.com")).cookie;
    const put = (cookie: string, rec: Record<string, unknown>) =>
      routes.rec.PUT(req(`/api/data/sessions/${rec.id}`, { method: "PUT", cookie, body: rec }), params({ collection: "sessions", id: String(rec.id) }));

    expect((await put(a, { id: "s1", title: "Fractions", updatedAt: 2000 })).status).toBe(200);
    // B can't see A's record, even by id.
    expect((await routes.rec.GET(req("/api/data/sessions/s1", { cookie: b }), params({ collection: "sessions", id: "s1" }))).status).toBe(404);
    expect((await (await routes.col.GET(req("/api/data/sessions", { cookie: b }), params({ collection: "sessions" }))).json()).records).toEqual([]);

    // An older copy doesn't overwrite a newer one.
    expect(await (await put(a, { id: "s1", title: "stale", updatedAt: 1000 })).json()).toEqual({ saved: false });
    await put(a, { id: "s1", title: "Fractions II", updatedAt: 3000 });
    const got = await (await routes.rec.GET(req("/api/data/sessions/s1", { cookie: a }), params({ collection: "sessions", id: "s1" }))).json();
    expect(got.record.title).toBe("Fractions II");

    const first = await (await routes.sync.GET(req("/api/data/sync", { cookie: a }))).json();
    expect(first.changes).toHaveLength(1);
    await routes.rec.DELETE(req("/api/data/sessions/s1", { method: "DELETE", cookie: a }), params({ collection: "sessions", id: "s1" }));
    const next = await (await routes.sync.GET(req(`/api/data/sync?since=${encodeURIComponent(first.cursor)}`, { cookie: a }))).json();
    expect(next.changes).toEqual([{ collection: "sessions", id: "s1", deleted: true, updatedAt: expect.any(Number), data: null }]);
  });

  it("rejects unauthenticated, unknown-collection and mismatched-id writes", async () => {
    const a = (await signUp()).cookie;
    expect((await routes.col.GET(req("/api/data/sessions"), params({ collection: "sessions" }))).status).toBe(401);
    expect((await routes.col.GET(req("/api/data/users", { cookie: a }), params({ collection: "users" }))).status).toBe(404);
    const res = await routes.rec.PUT(req("/api/data/sessions/x", { method: "PUT", cookie: a, body: { id: "y", updatedAt: 1 } }), params({ collection: "sessions", id: "x" }));
    expect(res.status).toBe(400);
  });

  it("requires sign-in for the tutor when REQUIRE_AUTH is on, without calling the model", async () => {
    process.env.REQUIRE_AUTH = "true";
    process.env.AI_PROVIDER = "groq";
    process.env.AI_API_KEY = "k";
    const body = { messages: [{ role: "user", content: "hi" }] };
    const model = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", model);
    expect((await routes.tutor.POST(req("/api/tutor", { method: "POST", body }))).status).toBe(401);
    expect(model).not.toHaveBeenCalled();
    const a = (await signUp()).cookie;
    const res = await routes.tutor.POST(req("/api/tutor", { method: "POST", body, cookie: a }));
    // Signed in: gets past auth (the fake key then fails at the provider, as an error event).
    expect(res.status).toBe(200);
    await res.text();
    expect(model).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  });
});
