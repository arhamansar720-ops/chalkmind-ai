-- Accounts, sessions and synced study data for Chalkmind.

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create unique index users_email_lower on users (lower(email));

-- Only a SHA-256 of each session token is stored; the token lives in an HttpOnly cookie.
create table auth_sessions (
  token_hash bytea primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index auth_sessions_user on auth_sessions (user_id);
create index auth_sessions_expires on auth_sessions (expires_at);

-- Failed sign-ins, for brute-force throttling across serverless instances.
create table auth_failures (
  email_lower text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index auth_failures_email on auth_failures (email_lower, at);
create index auth_failures_ip on auth_failures (ip, at);

-- One row per stored record (session, homework, study set, document, memory…).
-- Mirrors the client Repository interface; every query is scoped by user_id.
create table records (
  user_id uuid not null references users (id) on delete cascade,
  collection text not null,
  id text not null,
  data jsonb not null,
  -- Client clock (ms): last write wins.
  updated_at bigint not null,
  deleted boolean not null default false,
  -- Server clock: lets a device ask "what changed since I last synced".
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, collection, id)
);
create index records_user_synced on records (user_id, synced_at);
