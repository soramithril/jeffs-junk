-- The change log doubles as the recovery log, but it only watched 36 fields. When the
-- July job-number bug saved over 88 furniture jobs, they were rebuilt from this log and
-- came back with no items, because items were never logged (2026-10-30: 73 recovered
-- from the weekly backups, 14 lost for good). Every field a person types or ticks is
-- now logged. Left out on purpose: ids, who/when stamps, phone_digits (derived from
-- phone) and the timestamps the app sets itself.
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
    'po_number','job_name','crew_size','tasks',
    'items','furniture_items','internal_notes','photos','names','phones','emails',
    'business_name','no_email','bin_dropoff_time','bin_pickup_time','bin_live_load',
    'bin_will_call','fb_date','fb_time','junk_date','junk_time','truck_size',
    'est_duration_min','completed','review_ask','quote_note','quoted_amount',
    'quote_outcome','quote_job_id'
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
        WHEN 'furniture_items' THEN 'Furniture Items'
        WHEN 'internal_notes' THEN 'Internal Notes'
        WHEN 'names' THEN 'Extra Names'
        WHEN 'phones' THEN 'Extra Phones'
        WHEN 'emails' THEN 'Extra Emails'
        WHEN 'no_email' THEN 'No Email'
        WHEN 'bin_dropoff_time' THEN 'Drop-off Time'
        WHEN 'bin_pickup_time' THEN 'Pickup Time'
        WHEN 'bin_live_load' THEN 'Live Load'
        WHEN 'bin_will_call' THEN 'Will Call'
        WHEN 'fb_date' THEN 'FB Date'
        WHEN 'fb_time' THEN 'FB Time'
        WHEN 'est_duration_min' THEN 'Est. Duration'
        WHEN 'quote_job_id' THEN 'Quote Link'
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
