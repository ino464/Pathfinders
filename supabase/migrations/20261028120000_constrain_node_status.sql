-- Settles the node status vocabulary (#70). The core tables
-- migration left the check constraint commented out until the
-- team chose the values. packages/frontend/lib/node-status.js
-- holds the same list for the app.

-- Rows written before this migration can hold any string.
-- Keep accepted and rejected in any case or spacing, and reset
-- everything else to the default so the constraint can be added.
update public.nodes
set status = case lower(btrim(status))
    when 'accepted' then 'accepted'
    when 'rejected' then 'rejected'
    else 'pending'
  end
where status not in ('pending', 'accepted', 'rejected');

alter table public.nodes
  add constraint nodes_status_check
  check (status in ('pending', 'accepted', 'rejected'));
