-- One-time backfill of legacy job_changes rows produced by the old trigger:
--   1) Replace email-form changed_by values with the user's displayName from
--      user_profiles (joined via auth.users.email).
--   2) Replace raw snake_case field_name values with the same pretty labels
--      the new trigger now uses.

-- 1) changed_by: email -> displayName
UPDATE public.job_changes jc
SET changed_by = up.username
FROM auth.users au
JOIN public.user_profiles up ON up.id = au.id
WHERE jc.changed_by = au.email
  AND up.username IS NOT NULL
  AND up.username <> '';

-- 2) field_name: raw snake_case -> pretty label
UPDATE public.job_changes
SET field_name = CASE field_name
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
  WHEN 'name' THEN 'Name'
  WHEN 'phone' THEN 'Phone'
  WHEN 'address' THEN 'Address'
  WHEN 'city' THEN 'City'
  WHEN 'date' THEN 'Date'
  WHEN 'time' THEN 'Time'
  WHEN 'service' THEN 'Service'
  WHEN 'status' THEN 'Status'
  WHEN 'price' THEN 'Price'
  WHEN 'paid' THEN 'Paid'
  WHEN 'notes' THEN 'Notes'
  WHEN 'referral' THEN 'Referral'
  WHEN 'confirmed' THEN 'Confirmed'
  WHEN 'recurring' THEN 'Recurring'
  WHEN 'deposit' THEN 'Deposit'
  ELSE field_name
END
WHERE field_name IN (
  'bin_pickup','bin_dropoff','bin_instatus','bin_size','bin_duration','bin_side','bin_bid',
  'client_cid','deposit_paid','etransfer_refund_sent','pay_method','recur_interval',
  'material_type','tools_needed','email_sent','email_confirmed','swap_count',
  'name','phone','address','city','date','time','service','status','price','paid',
  'notes','referral','confirmed','recurring','deposit'
);
