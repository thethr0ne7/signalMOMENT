create extension if not exists pgcrypto;

create type public.chain_status as enum ('active', 'expired', 'completed');
create type public.game_session_status as enum ('created', 'started', 'finished', 'expired');
create type public.event_type as enum (
  'user_authenticated', 'chain_created', 'chain_joined',
  'session_created', 'result_recorded', 'chain_expired'
);

create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  username text,
  first_name text not null,
  last_name text,
  photo_url text,
  language_code text,
  is_premium boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.chains (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users(id) on delete cascade,
  status public.chain_status not null default 'active',
  participant_count integer not null default 1 check (participant_count >= 1),
  best_result numeric(6,3) not null default 0 check (best_result between 0 and 15),
  max_depth integer not null default 0 check (max_depth >= 0),
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chain_expiry_after_creation check (expires_at > created_at)
);

create table public.chain_members (
  chain_id uuid not null references public.chains(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  inviter_user_id uuid references public.users(id) on delete set null,
  share_token text not null unique default encode(gen_random_bytes(18), 'hex'),
  depth integer not null default 0 check (depth >= 0),
  best_result numeric(6,3) check (best_result between 0 and 15),
  joined_at timestamptz not null default now(),
  primary key (chain_id, user_id),
  constraint no_self_invitation check (inviter_user_id is null or inviter_user_id <> user_id)
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null references public.chains(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status public.game_session_status not null default 'created',
  seed bigint not null,
  nonce uuid not null default gen_random_uuid(),
  signature text not null,
  issued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  suspicious boolean not null default false,
  suspicious_reason text,
  created_at timestamptz not null default now(),
  constraint session_expiry_after_issue check (expires_at > issued_at),
  constraint session_finish_after_start check (finished_at is null or started_at is null or finished_at >= started_at)
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.game_sessions(id) on delete cascade,
  chain_id uuid not null references public.chains(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  score numeric(6,3) not null check (score between 0 and 15),
  accuracy numeric(6,3) not null check (accuracy between 0 and 100),
  success boolean not null,
  client_duration_ms integer not null check (client_duration_ms between 0 and 30000),
  server_duration_ms integer not null check (server_duration_ms between 0 and 30000),
  suspicious boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.events (
  id bigint generated always as identity primary key,
  event_type public.event_type not null,
  actor_user_id uuid references public.users(id) on delete set null,
  chain_id uuid references public.chains(id) on delete cascade,
  session_id uuid references public.game_sessions(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index chains_creator_idx on public.chains(creator_id, created_at desc);
create index chains_status_expiry_idx on public.chains(status, expires_at);
create index chain_members_user_idx on public.chain_members(user_id, joined_at desc);
create index chain_members_inviter_idx on public.chain_members(inviter_user_id) where inviter_user_id is not null;
create index game_sessions_user_idx on public.game_sessions(user_id, created_at desc);
create index game_sessions_chain_idx on public.game_sessions(chain_id, created_at desc);
create index results_user_idx on public.results(user_id, created_at desc);
create index results_chain_score_idx on public.results(chain_id, score desc);
create index events_chain_idx on public.events(chain_id, created_at desc);
create index events_actor_idx on public.events(actor_user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger users_touch_updated_at before update on public.users
for each row execute function public.touch_updated_at();
create trigger chains_touch_updated_at before update on public.chains
for each row execute function public.touch_updated_at();

create or replace function public.current_app_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select nullif(auth.jwt() -> 'user_metadata' ->> 'app_user_id', '')::uuid;
$$;

alter table public.users enable row level security;
alter table public.chains enable row level security;
alter table public.chain_members enable row level security;
alter table public.game_sessions enable row level security;
alter table public.results enable row level security;
alter table public.events enable row level security;

create policy users_read_self on public.users for select using (id = public.current_app_user_id());
create policy chains_read_members on public.chains for select using (exists (
  select 1 from public.chain_members cm where cm.chain_id = chains.id and cm.user_id = public.current_app_user_id()
));
create policy chain_members_read_chain on public.chain_members for select using (exists (
  select 1 from public.chain_members mine where mine.chain_id = chain_members.chain_id and mine.user_id = public.current_app_user_id()
));
create policy sessions_read_self on public.game_sessions for select using (user_id = public.current_app_user_id());
create policy results_read_chain on public.results for select using (exists (
  select 1 from public.chain_members cm where cm.chain_id = results.chain_id and cm.user_id = public.current_app_user_id()
));
create policy events_read_chain on public.events for select using (
  actor_user_id = public.current_app_user_id() or exists (
    select 1 from public.chain_members cm where cm.chain_id = events.chain_id and cm.user_id = public.current_app_user_id()
  )
);

comment on table public.users is 'Verified Telegram identities only; never populated from initDataUnsafe.';
comment on table public.chains is 'Primary social entity. Game sessions and results exist inside a chain.';
comment on column public.chain_members.share_token is 'Member-specific invitation token used for deterministic attribution.';
comment on table public.events is 'Append-only product and attribution event stream.';
