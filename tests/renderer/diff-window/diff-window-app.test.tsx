// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../src/renderer/grafter-api';
import { DiffWindowApp } from '../../../src/renderer/diff-window/DiffWindowApp';
import type { AppSnapshot } from '../../../src/shared/contracts';
import { commitDiffSessionFactory, settingsFactory } from '../../factories';
import {
  installDiffViewerObservers,
  type IntersectionObserverHarness,
} from '../diff/diff-viewer-test-harness';

let intersectionObservers: IntersectionObserverHarness | undefined;

const session = commitDiffSessionFactory.build();

function diffSnapshot(): AppSnapshot {
  return {
    kind: 'diff',
    homeDirectory: '/Users/developer',
    systemLocale: 'en-US',
    settings: settingsFactory.build(),
    toolPreferences: { editor: 'vscode', terminal: 'terminal' },
  };
}

function stubDiffWindowApi(options?: { initError?: Error }): void {
  vi.spyOn(api, 'getDiffWindowInit').mockImplementation(() =>
    options?.initError ? Promise.reject(options.initError) : Promise.resolve({ session }),
  );
  const snapshot = diffSnapshot();
  vi.spyOn(api, 'getSnapshot').mockResolvedValue(snapshot);
  vi.spyOn(api, 'onSnapshotUpdate').mockReturnValue(() => undefined);
}

describe('DiffWindowApp', () => {
  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers?.reset();
    intersectionObservers = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the bootstrapped diff session as the window surface', async () => {
    stubDiffWindowApi();

    render(<DiffWindowApp />);

    const surface = await screen.findByRole('region', {
      name: `Changes in commit ${session.commit.hash}`,
    });
    expect(surface).toBeVisible();
    // Closing is owned by the macOS traffic lights, not an in-page control.
    expect(screen.queryByRole('button', { name: /close/i })).toBeNull();
  });

  it('explains a failed bootstrap instead of rendering an empty window', async () => {
    stubDiffWindowApi({ initError: new Error('No pending diff initialization.') });

    render(<DiffWindowApp />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to open this diff.');
    });
    expect(screen.queryByRole('region', { name: /Changes in commit/ })).toBeNull();
  });

  it('requests closing its own window with Escape', async () => {
    stubDiffWindowApi();
    const closeDiffWindow = vi.spyOn(api, 'closeDiffWindow').mockResolvedValue(undefined);

    render(<DiffWindowApp />);
    await screen.findByRole('region', { name: /Changes in commit/ });
    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(closeDiffWindow).toHaveBeenCalledOnce();
    });
  });
});
