/*
  Inserts the children of one node and the edges to them in one
  transaction, so an expansion is either written in full or not
  written at all. A node inserted without its edge would have no
  parent, and context assembly would then see two roots.

  security invoker: the inserts run as the caller, so the RLS
  policies on nodes and edges apply exactly as they do to a
  direct insert.
*/
create function public.add_children(
  p_session_id      uuid,
  p_parent_node_id  uuid,
  p_contents        text[]
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
    raise exception 'add_children needs at least one child';
  end if;

  with inserted as (
    insert into public.nodes (session_id, content)
    select p_session_id, content
    from unnest(p_contents) as content
    returning id
  )
  select array_agg(id) into child_ids from inserted;

  insert into public.edges (session_id, parent_node_id, child_node_id)
  select p_session_id, p_parent_node_id, child_id
  from unnest(child_ids) as child_id;

  return jsonb_build_object(
    'nodes',
    (
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'content', n.content,
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

revoke execute on function public.add_children(uuid, uuid, text[])
  from public, anon;
grant execute on function public.add_children(uuid, uuid, text[])
  to authenticated;
