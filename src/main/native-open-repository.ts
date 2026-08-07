interface NativeWindow {
  isDestroyed(): boolean;
}

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}

interface NativeOpenRepositoryDependencies<TWindow extends NativeWindow> {
  getFocusedWindow(): TWindow | null;
  getAllWindows(): TWindow[];
  ensureWelcomeWindow(): Promise<TWindow>;
  showOpenDialog(window: TWindow): Promise<OpenDialogResult>;
  showOpenError(window: TWindow, detail: string): Promise<unknown>;
  openRepositoryFromWindow(window: TWindow, selectedPath: string): Promise<unknown>;
  logError(message: string, error: unknown): void;
}

/** Runs the native menu flow without exposing Electron globals to the test boundary. */
export async function openRepositoryFromNativeMenu<TWindow extends NativeWindow>(
  dependencies: NativeOpenRepositoryDependencies<TWindow>,
): Promise<void> {
  let invokingWindow: TWindow | undefined;
  try {
    invokingWindow =
      dependencies.getFocusedWindow() ??
      dependencies.getAllWindows()[0] ??
      (await dependencies.ensureWelcomeWindow());
    const result = await dependencies.showOpenDialog(invokingWindow);
    const selectedPath = result.filePaths[0];
    if (result.canceled || !selectedPath) return;
    await dependencies.openRepositoryFromWindow(invokingWindow, selectedPath);
  } catch (error) {
    dependencies.logError('Failed to open a repository.', error);
    if (!invokingWindow || invokingWindow.isDestroyed()) return;
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await dependencies.showOpenError(
        invokingWindow,
        `Choose an existing Git repository or worktree and try again.\n\n${reason}`,
      );
    } catch (displayError) {
      dependencies.logError('Failed to show the repository error dialog.', displayError);
    }
  }
}
