-- Chalkmind cloud sync schema (optional; the app works locally without it).
-- Each collection is one table. Rows hold the app record as JSON in `data`;
-- Row Level Security limits every row to its owner (auth.uid() = user_id),
-- so the browser's anon key can only ever touch the signed-in student's data.

create extension if not exists pgcrypto;

-- Tutor sessions: conversation, whiteboard snapshot, board index, attached document ids
create table if not exists public.cm_sessions (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_sessions_user_updated on public.cm_sessions (user_id, updated_at desc);
alter table public.cm_sessions enable row level security;
alter table public.cm_sessions force row level security;
drop policy if exists "cm_sessions_select_own" on public.cm_sessions;
drop policy if exists "cm_sessions_insert_own" on public.cm_sessions;
drop policy if exists "cm_sessions_update_own" on public.cm_sessions;
drop policy if exists "cm_sessions_delete_own" on public.cm_sessions;
create policy "cm_sessions_select_own" on public.cm_sessions for select to authenticated using (auth.uid() = user_id);
create policy "cm_sessions_insert_own" on public.cm_sessions for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_sessions_update_own" on public.cm_sessions for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_sessions_delete_own" on public.cm_sessions for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_sessions from anon;
grant select, insert, update, delete on public.cm_sessions to authenticated;

-- Homework solutions with verification results
create table if not exists public.cm_homework (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_homework_user_updated on public.cm_homework (user_id, updated_at desc);
alter table public.cm_homework enable row level security;
alter table public.cm_homework force row level security;
drop policy if exists "cm_homework_select_own" on public.cm_homework;
drop policy if exists "cm_homework_insert_own" on public.cm_homework;
drop policy if exists "cm_homework_update_own" on public.cm_homework;
drop policy if exists "cm_homework_delete_own" on public.cm_homework;
create policy "cm_homework_select_own" on public.cm_homework for select to authenticated using (auth.uid() = user_id);
create policy "cm_homework_insert_own" on public.cm_homework for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_homework_update_own" on public.cm_homework for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_homework_delete_own" on public.cm_homework for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_homework from anon;
grant select, insert, update, delete on public.cm_homework to authenticated;

-- Generated study materials (flashcards, quizzes, guides) and flashcard confidence
create table if not exists public.cm_materials (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_materials_user_updated on public.cm_materials (user_id, updated_at desc);
alter table public.cm_materials enable row level security;
alter table public.cm_materials force row level security;
drop policy if exists "cm_materials_select_own" on public.cm_materials;
drop policy if exists "cm_materials_insert_own" on public.cm_materials;
drop policy if exists "cm_materials_update_own" on public.cm_materials;
drop policy if exists "cm_materials_delete_own" on public.cm_materials;
create policy "cm_materials_select_own" on public.cm_materials for select to authenticated using (auth.uid() = user_id);
create policy "cm_materials_insert_own" on public.cm_materials for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_materials_update_own" on public.cm_materials for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_materials_delete_own" on public.cm_materials for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_materials from anon;
grant select, insert, update, delete on public.cm_materials to authenticated;

-- Quiz attempts and per-question results
create table if not exists public.cm_attempts (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_attempts_user_updated on public.cm_attempts (user_id, updated_at desc);
alter table public.cm_attempts enable row level security;
alter table public.cm_attempts force row level security;
drop policy if exists "cm_attempts_select_own" on public.cm_attempts;
drop policy if exists "cm_attempts_insert_own" on public.cm_attempts;
drop policy if exists "cm_attempts_update_own" on public.cm_attempts;
drop policy if exists "cm_attempts_delete_own" on public.cm_attempts;
create policy "cm_attempts_select_own" on public.cm_attempts for select to authenticated using (auth.uid() = user_id);
create policy "cm_attempts_insert_own" on public.cm_attempts for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_attempts_update_own" on public.cm_attempts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_attempts_delete_own" on public.cm_attempts for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_attempts from anon;
grant select, insert, update, delete on public.cm_attempts to authenticated;

-- Uploaded documents: extracted text chunks (and optional embeddings) — not the original file
create table if not exists public.cm_documents (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_documents_user_updated on public.cm_documents (user_id, updated_at desc);
alter table public.cm_documents enable row level security;
alter table public.cm_documents force row level security;
drop policy if exists "cm_documents_select_own" on public.cm_documents;
drop policy if exists "cm_documents_insert_own" on public.cm_documents;
drop policy if exists "cm_documents_update_own" on public.cm_documents;
drop policy if exists "cm_documents_delete_own" on public.cm_documents;
create policy "cm_documents_select_own" on public.cm_documents for select to authenticated using (auth.uid() = user_id);
create policy "cm_documents_insert_own" on public.cm_documents for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_documents_update_own" on public.cm_documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_documents_delete_own" on public.cm_documents for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_documents from anon;
grant select, insert, update, delete on public.cm_documents to authenticated;

-- Study planner tasks and goals
create table if not exists public.cm_tasks (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_tasks_user_updated on public.cm_tasks (user_id, updated_at desc);
alter table public.cm_tasks enable row level security;
alter table public.cm_tasks force row level security;
drop policy if exists "cm_tasks_select_own" on public.cm_tasks;
drop policy if exists "cm_tasks_insert_own" on public.cm_tasks;
drop policy if exists "cm_tasks_update_own" on public.cm_tasks;
drop policy if exists "cm_tasks_delete_own" on public.cm_tasks;
create policy "cm_tasks_select_own" on public.cm_tasks for select to authenticated using (auth.uid() = user_id);
create policy "cm_tasks_insert_own" on public.cm_tasks for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_tasks_update_own" on public.cm_tasks for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_tasks_delete_own" on public.cm_tasks for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_tasks from anon;
grant select, insert, update, delete on public.cm_tasks to authenticated;

-- Learning signals used for review recommendations (deletable by the student)
create table if not exists public.cm_signals (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_signals_user_updated on public.cm_signals (user_id, updated_at desc);
alter table public.cm_signals enable row level security;
alter table public.cm_signals force row level security;
drop policy if exists "cm_signals_select_own" on public.cm_signals;
drop policy if exists "cm_signals_insert_own" on public.cm_signals;
drop policy if exists "cm_signals_update_own" on public.cm_signals;
drop policy if exists "cm_signals_delete_own" on public.cm_signals;
create policy "cm_signals_select_own" on public.cm_signals for select to authenticated using (auth.uid() = user_id);
create policy "cm_signals_insert_own" on public.cm_signals for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_signals_update_own" on public.cm_signals for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_signals_delete_own" on public.cm_signals for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_signals from anon;
grant select, insert, update, delete on public.cm_signals to authenticated;

-- Student profile and preferences
create table if not exists public.cm_profile (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '',
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint data_size check (pg_column_size(data) < 8000000)
);
create index if not exists cm_profile_user_updated on public.cm_profile (user_id, updated_at desc);
alter table public.cm_profile enable row level security;
alter table public.cm_profile force row level security;
drop policy if exists "cm_profile_select_own" on public.cm_profile;
drop policy if exists "cm_profile_insert_own" on public.cm_profile;
drop policy if exists "cm_profile_update_own" on public.cm_profile;
drop policy if exists "cm_profile_delete_own" on public.cm_profile;
create policy "cm_profile_select_own" on public.cm_profile for select to authenticated using (auth.uid() = user_id);
create policy "cm_profile_insert_own" on public.cm_profile for insert to authenticated with check (auth.uid() = user_id);
create policy "cm_profile_update_own" on public.cm_profile for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "cm_profile_delete_own" on public.cm_profile for delete to authenticated using (auth.uid() = user_id);
revoke all on public.cm_profile from anon;
grant select, insert, update, delete on public.cm_profile to authenticated;
