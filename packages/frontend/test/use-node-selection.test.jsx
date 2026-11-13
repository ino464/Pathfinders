// @vitest-environment jsdom
import {
  act,
  cleanup,
  renderHook
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { useNodeSelection } from "../app/use-node-selection";

afterEach(cleanup);

describe("useNodeSelection", () => {
  test("starts with nothing selected and does not report it", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNodeSelection(onChange)
    );

    expect(result.current.selectedIds).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("reports each change of the selection", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNodeSelection(onChange)
    );

    act(() => result.current.clickNode("a", false));
    act(() => result.current.clickNode("b", true));
    act(() => result.current.clear());

    expect(onChange.mock.calls).toEqual([
      [["a"]],
      [["a", "b"]],
      [[]]
    ]);
  });

  test("does not report a click that changes nothing", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNodeSelection(onChange)
    );

    act(() => result.current.clickNode("a", false));
    act(() => result.current.clickNode("a", false));
    act(() => result.current.clear());
    act(() => result.current.clear());

    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
