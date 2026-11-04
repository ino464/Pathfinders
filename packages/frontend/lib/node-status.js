// The values that nodes.status accepts. The check constraint in
// supabase/migrations/20261028120000_constrain_node_status.sql
// holds the same list. This module has no server-only import,
// so the canvas can use it too.
export const NODE_STATUSES = [
  "pending",
  "accepted",
  "rejected"
];

// The canvas shows accepted as a liked flag and rejected as a
// disliked flag. Pending means no flag (#91).
export const FLAGS = {
  accepted: "Liked",
  rejected: "Disliked"
};

// The status to save when the user clicks a flag: the clicked
// flag, or pending when that flag is already set.
export function nextFlagStatus(current, clicked) {
  return current === clicked ? "pending" : clicked;
}
