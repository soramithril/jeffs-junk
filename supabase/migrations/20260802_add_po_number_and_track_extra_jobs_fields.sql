-- PO number for Extra Jobs work orders (nullable text; older jobs simply have none).
-- NOTE: must be applied BEFORE the po-number branch deploys — JOB_LIST_COLS selects
-- po_number, so every job list query fails if the column is missing.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS po_number text;

-- Track po_number + the Extra Jobs fields (job_name, crew_size, tasks) in the
-- job_changes audit log — they were missing from the trigger's fixed column list,
-- so edits to them left no history (job_changes doubles as the recovery log).
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
  RETURN NEW;
END;
$function$;
