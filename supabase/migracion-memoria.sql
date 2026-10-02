-- =====================================================================
-- Veinte Minutos - memoria de la iniciativa
-- Corre esto SOLO si ya aplicaste schema.sql antes.
-- En una base nueva no hace falta: schema.sql ya lo incluye.
-- Pegar en Supabase > SQL Editor > New query > Run. Es idempotente.
-- =====================================================================

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
