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
    expect(getDiffFile).toHaveBeenCalledOnce();
    expect(getDiffFile).toHaveBeenCalledWith({
      sessionId: scenario.branchSession.id,
      fileId: file.id,
    });
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
