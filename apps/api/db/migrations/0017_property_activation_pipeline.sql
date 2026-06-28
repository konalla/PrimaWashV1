alter table properties
  add column if not exists management_contact_name text,
  add column if not exists management_contact_email text,
  add column if not exists management_contact_phone text,
  add column if not exists outreach_notes text,
  add column if not exists next_follow_up_at timestamptz,
  add column if not exists last_contacted_at timestamptz,
  add column if not exists internal_owner text;

update properties
set management_contact_name = 'Management Office',
    outreach_notes = 'Resident demand signal is ready for first outreach.',
    internal_owner = 'Prima Wash Ops'
where id in ('prop_sg_reflections', 'prop_sg_interlace', 'prop_sg_marina_one')
  and management_contact_name is null;
