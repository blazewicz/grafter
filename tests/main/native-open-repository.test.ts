import { describe, expect, it, vi } from 'vitest';
import { openRepositoryFromNativeMenu } from '../../src/main/native-open-repository';

class FakeWindow {
  destroyed = false;
  session = 'unchanged';

  isDestroyed(): boolean {
    return this.destroyed;
  }
}

function createHarness() {
  const window = new FakeWindow();
  const getFocusedWindow = vi.fn(() => window);
  const getAllWindows = vi.fn(() => [window]);
  const ensureWelcomeWindow = vi.fn(() => Promise.resolve(window));
  const showOpenDialog = vi.fn(() =>
    Promise.resolve({
      canceled: false,
      filePaths: ['/selected'],
    }),
  );
  const showOpenError = vi.fn(() => Promise.resolve(undefined));
  const openRepositoryFromWindow = vi.fn(() => Promise.resolve(undefined));
  const logError = vi.fn();
  const run = () =>
    openRepositoryFromNativeMenu({
      getFocusedWindow,
      getAllWindows,
      ensureWelcomeWindow,
      showOpenDialog,
      showOpenError,
      openRepositoryFromWindow,
      logError,
    });
  return {
    window,
    showOpenDialog,
    showOpenError,
    openRepositoryFromWindow,
    logError,
    run,
  };
}

describe('openRepositoryFromNativeMenu', () => {
  it.each([
    'The selected folder does not exist.',
    'The selected folder is not a Git repository.',
    'Bare repositories are not supported.',
  ])('shows an actionable error and logs an open failure: %s', async (message) => {
    const harness = createHarness();
    const failure = new Error(message);
    harness.openRepositoryFromWindow.mockRejectedValue(failure);

    await harness.run();

    expect(harness.openRepositoryFromWindow).toHaveBeenCalledWith(
      harness.window,
      '/selected',
    );
    expect(harness.showOpenError).toHaveBeenCalledWith(
      harness.window,
      expect.stringContaining('Choose an existing Git repository or worktree'),
    );
    expect(harness.showOpenError).toHaveBeenCalledWith(
      harness.window,
      expect.stringContaining(message),
    );
    expect(harness.logError).toHaveBeenCalledWith(
      'Failed to open a repository.',
      failure,
    );
    expect(harness.window.session).toBe('unchanged');
    expect(harness.window.destroyed).toBe(false);
  });

  it('does nothing when repository selection is canceled', async () => {
    const harness = createHarness();
    harness.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await harness.run();

    expect(harness.openRepositoryFromWindow).not.toHaveBeenCalled();
    expect(harness.showOpenError).not.toHaveBeenCalled();
    expect(harness.logError).not.toHaveBeenCalled();
  });
});
