// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode, RefObject } from 'react';
import { useAnchoredPosition } from '../../../src/renderer/ui/useAnchoredPosition';

function mockRect(
  element: HTMLElement | null,
  rect: { left: number; top: number; width: number; height: number },
): void {
  if (!element) throw new Error('Expected the element to be mounted.');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(rect.left, rect.top, rect.width, rect.height),
  );
}

interface HookProps {
  open: boolean;
  recomputeKey?: unknown;
}

function renderPositionHook(initialProps: HookProps): {
  anchor: () => HTMLElement | null;
  floating: () => HTMLElement | null;
  rerender: (props: HookProps) => void;
  unmount: () => void;
  result: { current: { left: number; top: number } | undefined };
} {
  const anchorRef: RefObject<HTMLDivElement | null> = { current: null };
  const floatingRef: RefObject<HTMLDivElement | null> = { current: null };
  const wrapper = ({ children }: { children: ReactNode }): React.JSX.Element => (
    <div ref={anchorRef}>
      <div ref={floatingRef}>{children}</div>
    </div>
  );
  const rendered = renderHook(
    ({ open, recomputeKey }: HookProps) =>
      useAnchoredPosition({
        open,
        anchorRef,
        floatingRef,
        placement: 'bottom-start',
        recomputeKey,
      }),
    { wrapper, initialProps },
  );
  return {
    anchor: () => anchorRef.current,
    floating: () => floatingRef.current,
    rerender: (props) => rendered.rerender(props),
    unmount: () => rendered.unmount(),
    result: rendered.result,
  };
}

describe('useAnchoredPosition', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('returns undefined while closed and positions the floating element when opened', () => {
    const { anchor, floating, rerender, result } = renderPositionHook({ open: false });
    mockRect(anchor(), { left: 100, top: 100, width: 60, height: 24 });
    mockRect(floating(), { left: 0, top: 0, width: 200, height: 40 });

    expect(result.current).toBeUndefined();

    act(() => rerender({ open: true }));
    expect(result.current).toEqual({ left: 100, top: 129 });

    act(() => rerender({ open: false }));
    expect(result.current).toBeUndefined();
  });

  it('repositions on window resize and document scroll while open', () => {
    const { anchor, floating, rerender, result } = renderPositionHook({ open: false });
    mockRect(anchor(), { left: 100, top: 100, width: 60, height: 24 });
    mockRect(floating(), { left: 0, top: 0, width: 200, height: 40 });
    act(() => rerender({ open: true }));
    expect(result.current).toEqual({ left: 100, top: 129 });

    mockRect(anchor(), { left: 300, top: 100, width: 60, height: 24 });
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toEqual({ left: 300, top: 129 });

    mockRect(anchor(), { left: 500, top: 100, width: 60, height: 24 });
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toEqual({ left: 500, top: 129 });
  });

  it('removes its listeners when the popover closes', () => {
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const { rerender } = renderPositionHook({ open: false });

    act(() => rerender({ open: true }));
    act(() => rerender({ open: false }));

    expect(removeDocumentListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    );
    expect(removeWindowListener).toHaveBeenCalledWith('resize', expect.any(Function));
  });

  it('stops updating position after unmount', () => {
    const { anchor, floating, rerender, unmount, result } = renderPositionHook({
      open: false,
    });
    mockRect(anchor(), { left: 100, top: 100, width: 60, height: 24 });
    mockRect(floating(), { left: 0, top: 0, width: 200, height: 40 });
    act(() => rerender({ open: true }));
    expect(result.current).toEqual({ left: 100, top: 129 });

    unmount();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
  });

  it('recomputes position when the recompute key changes', () => {
    const { anchor, floating, rerender, result } = renderPositionHook({ open: false });
    mockRect(anchor(), { left: 100, top: 100, width: 60, height: 24 });
    mockRect(floating(), { left: 0, top: 0, width: 200, height: 40 });
    act(() => rerender({ open: true, recomputeKey: 'label-a' }));
    expect(result.current).toEqual({ left: 100, top: 129 });

    mockRect(anchor(), { left: 400, top: 100, width: 60, height: 24 });
    act(() => rerender({ open: true, recomputeKey: 'label-b' }));
    expect(result.current).toEqual({ left: 400, top: 129 });
  });
});
