/*
  Gives each expanded idea a short title (#90). The model returns a
  title and a description for each idea in the same call. A node on
  the canvas shows its title, and selecting it shows the description,
  which is stored in content.

  title is nullable. It stays null for the root, for manual children,
  for nodes created before this migration, and for nodes from chat
  (#71) and merge (#73). Those nodes show their content.

  add_children_to_parents now takes p_titles, one title for each
  entry in p_contents. The call fails if the two arrays differ in
  length, and nothing is written. The old three-argument signature is
  dropped first: create or replace with a new argument list would
  leave both versions in place, and a call through supabase.rpc could
  then be ambiguous. Dropping the function also drops its grants, so
  they are applied again below.
*/
alter table public.nodes add column title text;

drop function public.add_children_to_parents(uuid, uuid[], text[]);

create function public.add_children_to_parents(
  p_session_id       uuid,
  p_parent_node_ids  uuid[],
  p_contents         text[],
  p_titles           text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  child_ids uuid[];
begin
  if coalesce(cardinality(p_contents), 0) = 0 then
    raise exception 'add_children_to_parents needs at least one child';
  end if;

  if coalesce(cardinality(p_parent_node_ids), 0) = 0 then
    raise exception 'add_children_to_parents needs at least one parent';
  end if;

  if coalesce(cardinality(p_titles), 0) <> cardinality(p_contents) then
    raise exception 'add_children_to_parents needs one title per child';
  end if;

  with inserted as (
    insert into public.nodes (session_id, content, title)
    select p_session_id, t.content, t.title
    from unnest(p_contents, p_titles) as t(content, title)
    returning id
  )
  select array_agg(id) into child_ids from inserted;

  -- distinct: the same parent listed twice would break the unique
  -- constraint on (parent_node_id, child_node_id).
  insert into public.edges (session_id, parent_node_id, child_node_id)
  select distinct p_session_id, parent_id, child_id
  from unnest(p_parent_node_ids) as parent_id
  cross join unnest(child_ids) as child_id;

  return jsonb_build_object(
    'nodes',
    (
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'content', n.content,
        'title', n.title,
        'status', n.status,
        'position_x', n.position_x,
        'position_y', n.position_y
      ))
      from public.nodes n
      where n.id = any (child_ids)
    ),
    'edges',
    (
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'parent_node_id', e.parent_node_id,
        'child_node_id', e.child_node_id
      ))
      from public.edges e
      where e.child_node_id = any (child_ids)
    )
  );
end;
$$;

revoke execute on function public.add_children_to_parents(uuid, uuid[], text[], text[])
  from public, anon;
grant execute on function public.add_children_to_parents(uuid, uuid[], text[], text[])
  to authenticated;