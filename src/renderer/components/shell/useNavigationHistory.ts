import { useCallback, useReducer } from 'react';

export interface NavigationHistoryState {
  entries: readonly string[];
  index: number;
}

type NavigationHistoryAction =
  | { type: 'navigate'; id: string }
  | { type: 'back' }
  | { type: 'forward' }
  | {
      type: 'reconcile';
      availableIds: readonly string[];
      fallbackId: string | undefined;
    };

export const initialNavigationHistory: NavigationHistoryState = {
  entries: [],
  index: -1,
};

export function navigationHistoryReducer(
  state: NavigationHistoryState,
  action: NavigationHistoryAction,
): NavigationHistoryState {
  switch (action.type) {
    case 'navigate': {
      if (state.entries[state.index] === action.id) return state;
      return {
        entries: [...state.entries.slice(0, state.index + 1), action.id],
        index: state.index + 1,
      };
    }
    case 'back':
      return state.index > 0 ? { ...state, index: state.index - 1 } : state;
    case 'forward':
      return state.index < state.entries.length - 1
        ? { ...state, index: state.index + 1 }
        : state;
    case 'reconcile':
      return reconcileNavigationHistory(state, action.availableIds, action.fallbackId);
  }
}

export function reconcileNavigationHistory(
  state: NavigationHistoryState,
  availableIds: readonly string[],
  fallbackId: string | undefined,
): NavigationHistoryState {
  const available = new Set(availableIds);
  const currentId = state.entries[state.index];
  const entries = state.entries.filter((id) => available.has(id));

  if (!state.entries.length) {
    return fallbackId && available.has(fallbackId)
      ? { entries: [fallbackId], index: 0 }
      : state;
  }

  const entriesBeforeCurrent = state.entries
    .slice(0, state.index)
    .filter((id) => available.has(id)).length;
  const index =
    currentId !== undefined && available.has(currentId)
      ? entriesBeforeCurrent
      : entriesBeforeCurrent > 0
        ? entriesBeforeCurrent - 1
        : entries.length
          ? 0
          : -1;

  if (entries.length) {
    if (index === state.index && arraysEqual(entries, state.entries)) return state;
    return { entries, index };
  }

  return fallbackId && available.has(fallbackId)
    ? { entries: [fallbackId], index: 0 }
    : initialNavigationHistory;
}

export function useNavigationHistory(): {
  selectedId: string | undefined;
  canGoBack: boolean;
  canGoForward: boolean;
  navigate: (id: string) => void;
  goBack: () => void;
  goForward: () => void;
  reconcile: (availableIds: readonly string[], fallbackId: string | undefined) => void;
} {
  const [state, dispatch] = useReducer(
    navigationHistoryReducer,
    initialNavigationHistory,
  );
  const navigate = useCallback((id: string) => dispatch({ type: 'navigate', id }), []);
  const goBack = useCallback(() => dispatch({ type: 'back' }), []);
  const goForward = useCallback(() => dispatch({ type: 'forward' }), []);
  const reconcile = useCallback(
    (availableIds: readonly string[], fallbackId: string | undefined) =>
      dispatch({ type: 'reconcile', availableIds, fallbackId }),
    [],
  );

  return {
    selectedId: state.entries[state.index],
    canGoBack: state.index > 0,
    canGoForward: state.index < state.entries.length - 1,
    navigate,
    goBack,
    goForward,
    reconcile,
  };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((value, index) => value === right[index])
  );
}
