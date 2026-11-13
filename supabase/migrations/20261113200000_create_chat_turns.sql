create table public.chat_turns (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  session_id  uuid not null
                references public.sessions (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index chat_turns_user_id_created_at_idx
  on public.chat_turns (user_id, created_at);

alter table public.chat_turns enable row level security;

create policy "Users can read their own chat turns"
  on public.chat_turns
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can create chat turns in their own sessions"
  on public.chat_turns
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.sessions s
      where s.id = chat_turns.session_id
        and s.user_id = (select auth.uid())
    )
  );
