-- =====================================================================
-- Veinte Minutos - esquema completo
-- Pegar en Supabase > SQL Editor > New query > Run
-- Es idempotente: se puede correr varias veces sin romper nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Autores (owners). Se crea solo al registrarse.
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  name        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Iniciativas
-- ---------------------------------------------------------------------
create table if not exists initiatives (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users on delete cascade,
  title       text not null,
  one_liner   text not null,
  stage       text not null check (stage in ('idea','desarrollo','produccion')),
  area        text,
  status      text not null default 'facilitacion'
              check (status in ('facilitacion','borrador','rondas','cerrada')),
  created_at  timestamptz not null default now()
);
create index if not exists initiatives_owner_idx on initiatives(owner_id);

-- ---------------------------------------------------------------------
-- Transcripcion del facilitador (queda como evidencia del proceso)
-- ---------------------------------------------------------------------
create table if not exists facilitator_messages (
  id             bigserial primary key,
  initiative_id  uuid not null references initiatives on delete cascade,
  question_no    int,
  role           text not null check (role in ('user','assistant')),
  content        text not null,
  created_at     timestamptz not null default now()
);
create index if not exists fmsg_initiative_idx on facilitator_messages(initiative_id, id);

-- ---------------------------------------------------------------------
-- Respuestas capturadas a las 5 preguntas fijas
-- ---------------------------------------------------------------------
create table if not exists answers (
  id             uuid primary key default gen_random_uuid(),
  initiative_id  uuid not null references initiatives on delete cascade,
  question_no    int  not null check (question_no between 1 and 5),
  answer_text    text not null,
  quality        text not null default 'ok' check (quality in ('ok','weak')),
  created_at     timestamptz not null default now(),
  unique (initiative_id, question_no)
);

-- ---------------------------------------------------------------------
-- Documentos PR/FAQ. Cada edicion guardada crea una version nueva.
-- blocks = jsonb array:
--   { id, section: 'pr'|'faq_ext'|'faq_int', type: 'title'|'sub'|'para'|'quote'|'qa',
--     heading, text, flag: null|'supuesto'|'abierto',
--     status: 'open'|'resolved', evidence }
-- ---------------------------------------------------------------------
create table if not exists documents (
  id             uuid primary key default gen_random_uuid(),
  initiative_id  uuid not null references initiatives on delete cascade,
  version        int  not null default 1,
  blocks         jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  unique (initiative_id, version)
);
create index if not exists documents_initiative_idx on documents(initiative_id, version desc);

-- ---------------------------------------------------------------------
-- Rondas de lectura
-- ---------------------------------------------------------------------
create table if not exists rounds (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references documents on delete cascade,
  code         text not null unique,
  label        text,
  minutes      int  not null default 20,
  status       text not null default 'abierta' check (status in ('abierta','cerrada')),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists rounds_document_idx on rounds(document_id);

-- ---------------------------------------------------------------------
-- Participantes anonimos. Sin correo, sin nombre. Solo alias + token local.
-- ---------------------------------------------------------------------
create table if not exists participants (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references rounds on delete cascade,
  token         uuid not null default gen_random_uuid(),
  alias         text not null,
  started_at    timestamptz not null default now(),
  submitted_at  timestamptz,
  unique (round_id, token)
);

-- ---------------------------------------------------------------------
-- Anotaciones ancladas a un bloque del documento
-- ---------------------------------------------------------------------
create table if not exists annotations (
  id              uuid primary key default gen_random_uuid(),
  round_id        uuid not null references rounds on delete cascade,
  participant_id  uuid not null references participants on delete cascade,
  block_id        text not null,
  quote           text,
  comment         text,
  created_at      timestamptz not null default now()
);
create index if not exists annotations_round_idx on annotations(round_id, block_id);

-- =====================================================================
-- RLS
-- Regla de oro: participants y annotations NO tienen politicas.
-- Nadie los lee con la llave publica, ni el autor. Todo pasa por las
-- funciones del servidor, que son las que respetan el revelado en ciego.
-- =====================================================================

alter table profiles             enable row level security;
alter table initiatives          enable row level security;
alter table facilitator_messages enable row level security;
alter table answers              enable row level security;
alter table documents            enable row level security;
alter table rounds               enable row level security;
alter table participants         enable row level security;
alter table annotations          enable row level security;

drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists initiatives_own on initiatives;
create policy initiatives_own on initiatives
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists fmsg_own on facilitator_messages;
create policy fmsg_own on facilitator_messages
  for all to authenticated
  using (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()));

drop policy if exists answers_own on answers;
create policy answers_own on answers
  for all to authenticated
  using (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()));

drop policy if exists documents_own on documents;
create policy documents_own on documents
  for all to authenticated
  using (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()));

drop policy if exists rounds_own on rounds;
create policy rounds_own on rounds
  for all to authenticated
  using (exists (select 1 from documents d join initiatives i on i.id = d.initiative_id
                 where d.id = document_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from documents d join initiatives i on i.id = d.initiative_id
                 where d.id = document_id and i.owner_id = auth.uid()));

-- participants y annotations: sin politicas a proposito.

-- ---------------------------------------------------------------------
-- Alta automatica de perfil al registrarse
-- ---------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------
-- Memoria de la iniciativa: lo que el facilitador recuerda entre sesiones
-- ---------------------------------------------------------------------
create table if not exists initiative_notes (
  id             uuid primary key default gen_random_uuid(),
  initiative_id  uuid not null references initiatives on delete cascade,
  kind           text not null check (kind in ('contexto','decision','pendiente')),
  text           text not null,
  source         text not null default 'facilitador' check (source in ('facilitador','autor')),
  created_at     timestamptz not null default now()
);
create index if not exists notes_initiative_idx on initiative_notes(initiative_id, created_at);

alter table initiative_notes enable row level security;

drop policy if exists notes_own on initiative_notes;
create policy notes_own on initiative_notes
  for all to authenticated
  using (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()))
  with check (exists (select 1 from initiatives i
                 where i.id = initiative_id and i.owner_id = auth.uid()));
