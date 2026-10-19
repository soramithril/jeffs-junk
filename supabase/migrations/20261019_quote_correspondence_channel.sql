-- Review requests by text (Jake, 2026-10-19). quote_correspondence was email-only:
-- one row per email the app opened in the mail client. A review request can now go
-- out as a text instead (opened in Messages on a phone, or scanned off a QR on the
-- desktop), and it is filed in the same table so the client's history and the
-- communication timeline read one list, not two.
--   channel  : 'email' (every row so far) | 'text'
--   to_phone : the number a text went to; to_email stays null on a text row
alter table public.quote_correspondence
  add column if not exists channel text not null default 'email'
    check (channel in ('email','text')),
  add column if not exists to_phone text;

comment on column public.quote_correspondence.channel is 'email | text — how the message went out';
comment on column public.quote_correspondence.to_phone is 'Text rows only: the number it went to';
