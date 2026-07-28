// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  initialNavigationHistory,
  navigationHistoryReducer,
  reconcileNavigationHistory,
  useNavigationHistory,
} from '../../../src/renderer/shell/useNavigationHistory';
import { projectConfigFactory } from '../../factories';

const targets = {
  first: projectConfigFactory.build().id,
  second: projectConfigFactory.build().id,
  third: projectConfigFactory.build().id,
  fourth: projectConfigFactory.build().id,
};

describe('navigation history', () => {
  afterEach(() => {
    cleanup();
  });

  it('navigates backward and forward without duplicating destinations', () => {
    const { result } = renderHook(() => useNavigationHistory());

    expect(result.current.selectedId).toBeUndefined();
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);

    act(() => {
      result.current.navigate(targets.first);
      result.current.navigate(targets.second);
      result.current.navigate(targets.second);
    });

    expect(result.current.selectedId).toBe(targets.second);
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);

    act(() => result.current.goBack());
    expect(result.current.selectedId).toBe(targets.first);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(true);

    act(() => result.current.goForward());
    expect(result.current.selectedId).toBe(targets.second);
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(false);
  });

  it('clears forward entries after navigating from an earlier entry', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.navigate(targets.first);
      result.current.navigate(targets.second);
      result.current.navigate(targets.third);
      result.current.goBack();
      result.current.navigate(targets.fourth);
    });

    expect(result.current.selectedId).toBe(targets.fourth);
    expect(result.current.canGoForward).toBe(false);

    act(() => result.current.goBack());
    expect(result.current.selectedId).toBe(targets.second);
  });

  it('initializes from a snapshot without treating refreshes as navigation', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.reconcile([targets.first, targets.second], targets.second);
    });

    expect(result.current.selectedId).toBe(targets.second);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);

    act(() => {
      result.current.reconcile([targets.first, targets.second], targets.second);
    });

    expect(result.current.selectedId).toBe(targets.second);
    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);
  });

  it('prunes removed entries and selects the nearest remaining destination', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.navigate(targets.first);
      result.current.navigate(targets.second);
      result.current.navigate(targets.third);
      result.current.navigate(targets.fourth);
      result.current.goBack();
      result.current.reconcile(
        [targets.first, targets.second, targets.fourth],
        targets.second,
      );
    });

    expect(result.current.selectedId).toBe(targets.second);
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.canGoForward).toBe(true);

    act(() => result.current.goForward());
    expect(result.current.selectedId).toBe(targets.fourth);
  });
});

describe('navigation history helpers', () => {
  it('preserves state identity when reconciliation makes no changes', () => {
    const initialized = reconcileNavigationHistory(
      initialNavigationHistory,
      [targets.first, targets.second],
      targets.second,
    );

    expect(initialized).toEqual({ entries: [targets.second], index: 0 });
    expect(
      reconcileNavigationHistory(
        initialized,
        [targets.first, targets.second],
        targets.second,
      ),
    ).toBe(initialized);
  });

  it('does not change state when navigating to the current destination', () => {
    const state = {
      entries: [targets.first],
      index: 0,
    };

    expect(
      navigationHistoryReducer(state, {
        type: 'navigate',
        id: targets.first,
      }),
    ).toBe(state);
  });
});
