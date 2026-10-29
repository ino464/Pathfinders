// The values that nodes.status accepts. The check constraint in
// supabase/migrations/20261028120000_constrain_node_status.sql
// holds the same list. This module has no server-only import,
// so the canvas can use it too.
export const NODE_STATUSES = [
  "pending",
  "accepted",
  "rejected"
];
