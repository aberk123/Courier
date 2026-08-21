-- The single letter the drivers already read off the paper route sheets.
--
-- Ari, 2026-08-20: the courier booklet should mark each address's publications
-- with a letter printed big and bold, so it can be read at night. He chose the
-- letters already in use on Lakewood Courier's own spreadsheets over inventing
-- two-letter codes, so the drivers do not have to relearn anything.
--
-- Stored per publication rather than hardcoded in the PDF, so the office can
-- correct one without waiting for a deploy.
alter table public.publications
  add column if not exists courier_letter text;

alter table public.publications
  drop constraint if exists publications_courier_letter_format;
alter table public.publications
  add constraint publications_courier_letter_format
  check (courier_letter is null or courier_letter ~ '^[A-Z]$');

-- Two publications sharing a letter would make a route sheet ambiguous, which
-- is exactly the failure this column exists to prevent. NULLs stay allowed, so
-- a newly added publication simply has no letter until someone assigns one.
create unique index if not exists publications_courier_letter_key
  on public.publications (courier_letter)
  where courier_letter is not null;

-- Ten of these are confirmed by the sample zone files (see the "Real
-- route-file structure" section of docs/domain-notes.md): B, V, S, Y, M, A, C,
-- H, N, L. Note Bina is N, not B -- BP already owns B.
--
-- The remaining five (Dee Voch, Wellsprings, Kindline, Shtenderel, Hundred) are
-- NOT in the notes; their columns trail off with "...". These are first-letter
-- picks that avoid a collision, and they need Amrom's confirmation before the
-- first real print run. Shtenderel is T because Shopper owns S, and Hundred is
-- U because Hamodia owns H.
update public.publications set courier_letter = v.letter
  from (values
    ('bp','B'),
    ('voice','V'),
    ('shopper','S'),
    ('yated','Y'),
    ('mishpacha','M'),
    ('ami','A'),
    ('circle','C'),
    ('hamodia','H'),
    ('bina','N'),
    ('lakewood_courier','L'),
    -- unconfirmed, see above
    ('dee_voch','D'),
    ('wellsprings','W'),
    ('kindline','K'),
    ('shtenderel','T'),
    ('hundred','U')
  ) as v(code, letter)
 where publications.code = v.code
   and publications.courier_letter is null;
