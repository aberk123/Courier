-- The standing questions the weekly import raises, persisted so they can be
-- answered OUTSIDE the import process -- by the Voice office for master-list
-- questions, by Amrom (via a printable list) for route questions.
--
-- Ari, 2026-09-01: "I want to send the questions to the Voice office so they
-- can answer them and the answers get recorded so that the questions don't
-- come up again... I need a platform or a portal or a format for them to
-- answer these questions."
--
-- Design rules (planned by the advisor, hardened by adversarial review; the
-- full record is in docs/domain-notes.md):
--   * An answer here is a RECORDED FACT, never an applied write. Writes happen
--     only through the existing import apply, edit paths, and courier-office
--     ruling buttons.
--   * A question is identified by question_key (kind|street|house), stable
--     across uploads. Volatile facts (counts, ranges, doors) live in the
--     fingerprint: an answered question whose key re-arises STAYS ANSWERED
--     unless the fingerprint changed -- re-uploading the same file must never
--     reopen the office's work.
--   * Supersede happens only on a CLEAN apply, scoped to the applied
--     publication -- a junk upload must not mass-supersede real questions.
--   * Scoped staff answer through answer_import_question() only; the audience
--     column is not theirs to write (a retag could hide questions), and
--     pass-to-Amrom is an answer choice the function turns into a retag.

create table if not exists public.import_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,

  publication_id uuid not null references public.publications(id) on delete cascade,
  kind text not null,
  -- Normalised the same way the matcher normalises, like address_rulings.
  street text not null,
  house_number text,
  question_key text not null,

  -- The question as the import screen words it, plus sanitised supporting
  -- facts. Evidence must contain NO recipient names from our stops and no
  -- publication letters other than this question's own publication; candidate
  -- lines from other publications appear only as a count. Enforced at write
  -- time (the plan action builds it) and pinned by a unit test -- RLS cannot
  -- redact jsonb.
  prompt text not null,
  evidence jsonb not null default '{}'::jsonb,
  -- Hash of the volatile facts. Differs => the ground moved => reopen.
  fingerprint text not null,

  audience text not null check (audience in ('voice_office', 'courier_office', 'amrom')),

  status text not null default 'open' check (status in ('open', 'answered', 'superseded')),
  answer jsonb,
  answered_at timestamptz,
  answered_by uuid references auth.users(id) on delete set null,

  first_seen_plan_at timestamptz not null default now(),
  last_seen_plan_at timestamptz not null default now(),

  -- status='answered' with no answer recorded is a hole a careless client
  -- could write through policy checks alone.
  constraint import_questions_answer_complete
    check (status <> 'answered' or (answer is not null and answered_by is not null and answered_at is not null)),

  -- publication_id is NOT NULL, so a plain unique works. (With a nullable
  -- column this would need `nulls not distinct` -- the exact trap
  -- 20260831140000_address_rulings_key.sql documents.)
  unique (publication_id, question_key)
);

create index if not exists import_questions_pub_status_idx
  on public.import_questions (publication_id, status);

alter table public.import_questions enable row level security;

-- Reads: courier office everything; scoped staff their own publications'
-- questions only.
drop policy if exists import_questions_select on public.import_questions;
create policy import_questions_select on public.import_questions
  for select to authenticated
  using (publication_id in (select public.accessible_publication_ids()));

-- Table writes are courier office only. Scoped staff answer exclusively
-- through answer_import_question() below -- they get NO direct UPDATE, so the
-- audience/status/kind columns are out of their reach entirely.
drop policy if exists import_questions_insert on public.import_questions;
create policy import_questions_insert on public.import_questions
  for insert to authenticated
  with check (public.is_courier_office());

drop policy if exists import_questions_update on public.import_questions;
create policy import_questions_update on public.import_questions
  for update to authenticated
  using (public.is_courier_office())
  with check (public.is_courier_office());

drop policy if exists import_questions_delete on public.import_questions;
create policy import_questions_delete on public.import_questions
  for delete to authenticated
  using (public.is_courier_office());

-- ---------------------------------------------------------------------------
-- Plan-time upsert (courier office; RLS applies -- invoker rights).
-- Refreshes the prose and facts, bumps last_seen, and applies the lifecycle:
-- superseded questions that re-arise reopen (also how undo_import_run's
-- questions come back); answered questions reopen ONLY if the fingerprint
-- moved; otherwise status is untouched.
-- ---------------------------------------------------------------------------
create or replace function public.upsert_import_questions(p_rows jsonb)
returns void
language sql
as $$
  insert into public.import_questions
    (created_by, publication_id, kind, street, house_number, question_key,
     prompt, evidence, fingerprint, audience)
  select
    auth.uid(),
    (r->>'publicationId')::uuid,
    r->>'kind',
    r->>'street',
    r->>'houseNumber',
    r->>'questionKey',
    r->>'prompt',
    coalesce(r->'evidence', '{}'::jsonb),
    r->>'fingerprint',
    r->>'audience'
  from jsonb_array_elements(p_rows) as r
  on conflict (publication_id, question_key) do update set
    kind = excluded.kind,
    street = excluded.street,
    house_number = excluded.house_number,
    prompt = excluded.prompt,
    evidence = excluded.evidence,
    last_seen_plan_at = now(),
    status = case
      when import_questions.status = 'superseded' then 'open'
      when import_questions.status = 'answered'
        and import_questions.fingerprint <> excluded.fingerprint then 'open'
      else import_questions.status
    end,
    fingerprint = excluded.fingerprint;
$$;

-- ---------------------------------------------------------------------------
-- Supersede on clean apply (courier office; RLS applies). Publication-scoped:
-- applying a Voice roster must not touch another publication's questions.
-- Targets answered rows too, so a question the office fixed at the source
-- (and which therefore stopped re-arising) is retired rather than sitting
-- answered forever.
-- ---------------------------------------------------------------------------
create or replace function public.supersede_import_questions(
  p_publication_id uuid,
  p_keep_keys jsonb
)
returns integer
language sql
as $$
  with gone as (
    update public.import_questions q
    set status = 'superseded'
    where q.publication_id = p_publication_id
      and q.status in ('open', 'answered')
      and not (q.question_key in (select jsonb_array_elements_text(p_keep_keys)))
    returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- The one write path for publication-scoped staff. SECURITY DEFINER because
-- they hold no table UPDATE grant at all; every check the policy would have
-- made is made here, plus the ones a policy cannot express:
--   * only questions on a publication they can access
--   * only open questions, and only those addressed to the voice office
--     (courier office can answer anything)
--   * pass_to_amrom retags the audience but leaves the question OPEN --
--     passing a question on is not answering it
-- ---------------------------------------------------------------------------
create or replace function public.answer_import_question(
  p_question_id uuid,
  p_choice text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.import_questions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_choice is null or length(trim(p_choice)) = 0 or length(p_choice) > 64 then
    raise exception 'a choice is required';
  end if;
  if length(coalesce(p_note, '')) > 2000 then
    raise exception 'note is too long';
  end if;

  select * into q from public.import_questions where id = p_question_id;
  if not found then
    raise exception 'question not found';
  end if;
  if q.publication_id not in (select public.accessible_publication_ids()) then
    raise exception 'question not found';
  end if;
  if q.status <> 'open' then
    raise exception 'this question is no longer open';
  end if;
  if not public.is_courier_office() and q.audience <> 'voice_office' then
    raise exception 'this question is not yours to answer';
  end if;

  if p_choice = 'pass_to_amrom' then
    update public.import_questions
    set audience = 'amrom',
        answer = jsonb_build_object('choice', p_choice, 'note', p_note),
        answered_by = auth.uid(),
        answered_at = now()
    where id = p_question_id;
  else
    update public.import_questions
    set status = 'answered',
        answer = jsonb_build_object('choice', p_choice, 'note', p_note),
        answered_by = auth.uid(),
        answered_at = now()
    where id = p_question_id;
  end if;
end;
$$;
