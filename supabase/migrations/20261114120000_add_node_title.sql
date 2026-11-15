alter table public.nodes add column title text;
drop function public.add_children_to_parents(uuid, uuid[], text[]);
create function public.add_children_to_parents(
  p_session_id       uuid,
  p_parent_node_ids  uuid[],
  p_contents         text[]
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

  with inserted as (
    insert into public.nodes (session_id, content)
    select p_session_id, content
    from unnest(p_contents) as content
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