import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";
import {
  nextSelection,
  sameSelection
} from "../lib/node-selection";

// Holds the ids of the selected nodes on the canvas, at most two
// (#94). The composer (#72) reads the same selection. onChange
// receives the new ids after each change, so a chat can end when
// the selection changes.
export function useNodeSelection(onChange) {
  const [selectedIds, setSelectedIds] = useState([]);
  const onChangeRef = useRef(onChange);
  const reportedIds = useRef(selectedIds);

  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    if (sameSelection(reportedIds.current, selectedIds)) return;
    reportedIds.current = selectedIds;
    onChangeRef.current?.(selectedIds);
  }, [selectedIds]);

  // keeps the old array when nothing changed, so a click on the
  // only selected node does not report a change
  const update = useCallback((next) => {
    setSelectedIds((current) => {
      const ids = next(current);
      return sameSelection(current, ids) ? current : ids;
    });
  }, []);

  const clickNode = useCallback(
    (nodeId, additive) =>
      update((current) =>
        nextSelection(current, nodeId, additive)
      ),
    [update]
  );

  const clear = useCallback(() => update(() => []), [update]);

  return { selectedIds, clickNode, clear };
}
