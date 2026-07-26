// @vitest-environment happy-dom

import { act, cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../../src/renderer/grafter-api';
import type { DiffFilePatch } from '../../../../src/shared/contracts';
import { deferred } from '../../../support/deferred';
import {
  getFileSection,
  installDiffViewerObservers,
  type IntersectionObserverHarness,
  renderDiffViewer,
  scenario,
} from './diff-viewer-test-harness';

const textualHunk = scenario.patches.textual.hunks[0];
if (!textualHunk) throw new Error('Expected the scenario to include a textual hunk.');

describe('DiffViewer patch lifecycle', () => {
  let intersectionObservers: IntersectionObserverHarness;

  beforeEach(() => {
    intersectionObservers = installDiffViewerObservers();
  });

  afterEach(() => {
    cleanup();
    intersectionObservers.reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits for intersection and deduplicates repeated patch requests', async () => {
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    expect(getDiffFile).not.toHaveBeenCalled();

    act(() => intersectionObservers.notify(fileSection, false));
    expect(getDiffFile).not.toHaveBeenCalled();

    act(() => {
      intersectionObservers.notify(fileSection, true);
      intersectionObservers.notify(fileSection, true);
    });

    await waitFor(() => expect(getDiffFile).toHaveBeenCalledOnce());
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
    expect(within(fileSection).getByText('Loading patch…')).toBeVisible();
  });

  it('renders a resolved textual patch with its hunk and representative lines', async () => {
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(within(fileSection).getByText('Loading patch…')).toBeVisible();

    await act(async () => {
      request.resolve(scenario.patches.textual);
      await request.promise;
    });

    expect(
      await within(fileSection).findByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    const contextRow = within(fileSection)
      .getByText(scenario.lines.context.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    const deletionRow = within(fileSection)
      .getByText(scenario.lines.deletion.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    const additionRow = within(fileSection)
      .getByText(scenario.lines.addition.text, { selector: 'code' })
      .closest<HTMLElement>('[data-diff-line-id]');
    if (!contextRow || !deletionRow || !additionRow) {
      throw new Error('Expected the representative textual diff rows.');
    }

    expect(contextRow).toHaveTextContent(String(scenario.lines.context.oldLine));
    expect(contextRow).toHaveTextContent(String(scenario.lines.context.newLine));
    expect(deletionRow).toHaveTextContent(String(scenario.lines.deletion.oldLine));
    expect(deletionRow).toHaveTextContent('−');
    expect(additionRow).toHaveTextContent(String(scenario.lines.addition.newLine));
    expect(additionRow).toHaveTextContent('+');
    expect(
      within(fileSection).getByText(scenario.lines.annotation.text, {
        selector: 'code',
      }),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('shows a friendly file-local failure without invoking the viewer error callback', async () => {
    const remoteMessage =
      "Error invoking remote method 'diff:get-file': Error: Patch data is unavailable";
    const onError = vi.fn<(message: string) => void>();
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockRejectedValue(new Error(remoteMessage));
    const file = scenario.files.modified;
    renderDiffViewer(scenario.branchSession, {
      onSessionChange: () => undefined,
      onClose: () => undefined,
      onError,
    });
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));

    expect(
      await within(fileSection).findByText('Could not load this file'),
    ).toBeVisible();
    expect(within(fileSection).getByText('Patch data is unavailable')).toBeVisible();
    expect(onError).not.toHaveBeenCalled();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('explains a binary file from its summary before a patch request', () => {
    const getDiffFile = vi.spyOn(api, 'getDiffFile');
    const file = scenario.files.binary;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Binary file changed')).toBeVisible();
    expect(
      within(fileSection).getByText(
        'Grafter cannot display a textual diff for this file.',
      ),
    ).toBeVisible();
    expect(getDiffFile).not.toHaveBeenCalled();
  });

  it('explains a binary patch when the summary did not identify binary content', async () => {
    const file = { ...scenario.files.binary, binary: false };
    const session = {
      ...scenario.branchSession,
      files: scenario.branchSession.files.map((candidate) =>
        candidate.id === file.id ? file : candidate,
      ),
    };
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.binary);
    renderDiffViewer(session);
    const fileSection = getFileSection(file);

    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();
    act(() => intersectionObservers.notify(fileSection, true));

    expect(await within(fileSection).findByText('Binary file changed')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: session.id,
      fileId: file.id,
    });
  });

  it('explains metadata-only changes when the patch has no hunks', async () => {
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.metadataOnly);
    const file = scenario.files.metadataOnly;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));

    expect(
      await within(fileSection).findByText('No textual lines changed'),
    ).toBeVisible();
    expect(
      within(fileSection).getByText('The file mode or metadata changed.'),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('loads multiple files concurrently and resolves them independently out of order', async () => {
    const textualRequest = deferred<DiffFilePatch>();
    const metadataRequest = deferred<DiffFilePatch>();
    const textualFile = scenario.files.renamed;
    const metadataFile = scenario.files.metadataOnly;
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockImplementation((request) => {
      if (request.fileId === textualFile.id) return textualRequest.promise;
      if (request.fileId === metadataFile.id) return metadataRequest.promise;
      return Promise.reject(new Error(`Unexpected patch request for ${request.fileId}`));
    });
    renderDiffViewer();
    const textualSection = getFileSection(textualFile);
    const metadataSection = getFileSection(metadataFile);

    act(() => {
      intersectionObservers.notify(textualSection, true);
      intersectionObservers.notify(metadataSection, true);
    });

    expect(within(textualSection).getByText('Loading patch…')).toBeVisible();
    expect(within(metadataSection).getByText('Loading patch…')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledTimes(2);
    expect(getDiffFile).toHaveBeenNthCalledWith(1, {
      sessionId: scenario.branchSession.id,
      fileId: textualFile.id,
    });
    expect(getDiffFile).toHaveBeenNthCalledWith(2, {
      sessionId: scenario.branchSession.id,
      fileId: metadataFile.id,
    });

    await act(async () => {
      metadataRequest.resolve(scenario.patches.metadataOnly);
      await metadataRequest.promise;
    });
    expect(
      await within(metadataSection).findByText('No textual lines changed'),
    ).toBeVisible();
    expect(within(textualSection).getByText('Loading patch…')).toBeVisible();

    await act(async () => {
      textualRequest.resolve(scenario.patches.textual);
      await textualRequest.promise;
    });
    expect(
      await within(textualSection).findByText(textualHunk.header, {
        selector: 'code',
      }),
    ).toBeVisible();
    expect(within(metadataSection).getByText('No textual lines changed')).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledTimes(2);
  });

  it('disconnects a collapsed unrequested file and restores lazy eligibility on expand', async () => {
    const user = userEvent.setup();
    const request = deferred<DiffFilePatch>();
    const getDiffFile = vi.spyOn(api, 'getDiffFile').mockReturnValue(request.promise);
    const file = scenario.files.modified;
    renderDiffViewer();
    const fileSection = getFileSection(file);
    const collapseButton = screen.getByRole('button', {
      name: `Collapse ${file.path} diff`,
    });

    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    await user.click(collapseButton);
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(0);
    expect(intersectionObservers.disconnectedObserverCount(fileSection)).toBe(1);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(getDiffFile).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: `Expand ${file.path} diff` }));
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);
    expect(within(fileSection).getByText('Patch will load when visible')).toBeVisible();

    act(() => intersectionObservers.notify(fileSection, true));
    await waitFor(() => expect(getDiffFile).toHaveBeenCalledOnce());
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });

  it('preserves a requested patch across collapse and expand without another request', async () => {
    const user = userEvent.setup();
    const getDiffFile = vi
      .spyOn(api, 'getDiffFile')
      .mockResolvedValue(scenario.patches.textual);
    const file = scenario.files.renamed;
    renderDiffViewer();
    const fileSection = getFileSection(file);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(
      await within(fileSection).findByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    expect(getDiffFile).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: `Collapse ${file.path} diff` }));
    expect(
      within(fileSection).queryByText(textualHunk.header, { selector: 'code' }),
    ).toBeNull();

    await user.click(screen.getByRole('button', { name: `Expand ${file.path} diff` }));
    expect(
      within(fileSection).getByText(textualHunk.header, { selector: 'code' }),
    ).toBeVisible();
    expect(intersectionObservers.activeObserverCount(fileSection)).toBe(1);

    act(() => intersectionObservers.notify(fileSection, true));
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
  });
});
