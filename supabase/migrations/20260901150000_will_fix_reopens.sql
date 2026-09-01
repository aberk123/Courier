-- "We will fix this in our own database" is a different kind of answer.
--
-- Ari, 2026-09-01: "It may be better for them to correct it in the database so
-- that it exports better next time rather than just teaching the system to
-- ignore it... They should have an option to say that they're going to fix it
-- in their own database so that the next export won't be flagged."
--
-- Every other answer is a standing fact, so an unchanged question stays
-- answered when it re-arises. A WILL-FIX answer is a promise about the next
-- export -- if the question arises again at all, the export still shows the
-- problem and the promise did not land, so it must REOPEN (with the promise
-- shown) rather than hide the question forever. The reopen is the follow-up.

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
      -- A will-fix promise re-arising means the export still shows the
      -- problem: reopen regardless of the fingerprint.
      when import_questions.status = 'answered'
        and import_questions.answer->>'choice' = 'will_fix_at_source' then 'open'
      when import_questions.status = 'answered'
        and import_questions.fingerprint <> excluded.fingerprint then 'open'
      else import_questions.status
    end,
    fingerprint = excluded.fingerprint;
$$;
