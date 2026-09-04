-- Driver assignments were the one thing the job history never recorded, so when a
-- dispatch plan landed wrong on 2026-09-03 the day had to be rebuilt from GPS.
-- From here every change to dropoff_crew_id / pickup_crew_id (and, for jobs that
-- are not bin rentals, assigned_crew_ids) writes a history row, with the crew
-- member's NAME in old/new so the log reads "Neil -> Kevin" and not two uuids.
-- The Dispatch page's "Undo last change" reverts from these rows.

CREATE OR REPLACE FUNCTION public.crew_name(cid uuid)
RETURNS text
LANGUAGE sql
STABLE STRICT
AS $$
  SELECT coalesce((SELECT name FROM public.crew_members WHERE id = cid), cid::text);
$$;

CREATE OR REPLACE FUNCTION public.crew_names(cids uuid[])
RETURNS text
LANGUAGE sql
STABLE STRICT
AS $$
  SELECT string_agg(public.crew_name(x), ', ' ORDER BY ord)
  FROM unnest(cids) WITH ORDINALITY AS t(x, ord);
$$;

CREATE OR REPLACE FUNCTION public.log_job_changes()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  col text;
  label text;
  old_val text;
  new_val text;
  who text;
  jwt_email text;
  cols text[] := ARRAY[
    'name','phone','address','city','date','time','service','status','price','paid',
    'notes','referral','confirmed','email_sent','bin_size','bin_duration',
    'bin_dropoff','bin_pickup','bin_instatus','bin_side','bin_bid','client_cid',
    'deposit','deposit_paid','etransfer_refund_sent','pay_method','recurring',
    'recur_interval','material_type','tools_needed','email_confirmed','swap_count',
    'po_number','job_name','crew_size','tasks'
  ];
BEGIN
  who := nullif(current_setting('app.actor', true), '');
  IF who IS NULL THEN
    SELECT username INTO who FROM public.user_profiles WHERE id = auth.uid();
    IF who IS NULL OR who = '' THEN
      jwt_email := (current_setting('request.jwt.claims', true))::json ->> 'email';
      who := coalesce(split_part(jwt_email, '@', 1), 'system');
      IF who = '' THEN who := 'system'; END IF;
    END IF;
  END IF;

  FOREACH col IN ARRAY cols LOOP
    EXECUTE format('SELECT ($1).%I::text, ($2).%I::text', col, col)
      INTO old_val, new_val
      USING OLD, NEW;
    IF old_val IS DISTINCT FROM new_val THEN
      label := CASE col
        WHEN 'bin_pickup' THEN 'Pickup'
        WHEN 'bin_dropoff' THEN 'Drop-off'
        WHEN 'bin_instatus' THEN 'Bin Status'
        WHEN 'bin_size' THEN 'Bin Size'
        WHEN 'bin_duration' THEN 'Duration'
        WHEN 'bin_side' THEN 'Driveway Side'
        WHEN 'bin_bid' THEN 'Bin'
        WHEN 'client_cid' THEN 'Client'
        WHEN 'deposit_paid' THEN 'Deposit Paid'
        WHEN 'etransfer_refund_sent' THEN 'E-Transfer Refund'
        WHEN 'pay_method' THEN 'Pay Method'
        WHEN 'recur_interval' THEN 'Recur Interval'
        WHEN 'material_type' THEN 'Material'
        WHEN 'tools_needed' THEN 'Tools Needed'
        WHEN 'email_sent' THEN 'Email Sent'
        WHEN 'email_confirmed' THEN 'Email Confirmed'
        WHEN 'swap_count' THEN 'Swap Count'
        WHEN 'po_number' THEN 'PO Number'
        WHEN 'job_name' THEN 'Job Name'
        WHEN 'crew_size' THEN 'Crew Size'
        WHEN 'tasks' THEN 'Tasks'
        ELSE initcap(replace(col, '_', ' '))
      END;
      INSERT INTO public.job_changes (job_id, field_name, old_value, new_value, changed_by)
      VALUES (NEW.job_id, label, old_val, new_val, who);
    END IF;
  END LOOP;

  -- Driver per leg. Names, not ids. The labels are what the Dispatch undo looks for.
  IF OLD.dropoff_crew_id IS DISTINCT FROM NEW.dropoff_crew_id THEN
    INSERT INTO public.job_changes (job_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.job_id, 'Drop-off Driver', public.crew_name(OLD.dropoff_crew_id), public.crew_name(NEW.dropoff_crew_id), who);
  END IF;
  IF OLD.pickup_crew_id IS DISTINCT FROM NEW.pickup_crew_id THEN
    INSERT INTO public.job_changes (job_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.job_id, 'Pickup Driver', public.crew_name(OLD.pickup_crew_id), public.crew_name(NEW.pickup_crew_id), who);
  END IF;
  -- On a bin rental assigned_crew_ids is just the union of the two legs (kept by
  -- sync_bin_assigned_crew_ids), so logging it there would repeat the lines above.
  IF NEW.service IS DISTINCT FROM 'Bin Rental' AND OLD.assigned_crew_ids IS DISTINCT FROM NEW.assigned_crew_ids THEN
    INSERT INTO public.job_changes (job_id, field_name, old_value, new_value, changed_by)
    VALUES (NEW.job_id, 'Crew', public.crew_names(OLD.assigned_crew_ids), public.crew_names(NEW.assigned_crew_ids), who);
  END IF;
  RETURN NEW;
END;
$function$;
