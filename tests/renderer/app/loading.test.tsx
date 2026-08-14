// @vitest-environment happy-dom

import { act, cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppSnapshot } from '../../../src/shared/contracts';
import { buildRepositoryWindowScenario } from '../../scenarios/sidebar/repository-window';
import { buildWelcomeScenario } from '../../scenarios/welcome/welcome';
import { deferred } from '../../support/deferred';
import { renderApp, stubRepositoryWindowApis } from './app-test-support';

const welcomeScenario = buildWelcomeScenario();
const repositoryScenario = buildRepositoryWindowScenario();

describe('App loading state', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps transient loading distinct from the persistent empty welcome', async () => {
    const snapshot = deferred<AppSnapshot>();
    renderApp(snapshot.promise);

    expect(screen.getByRole('status', { name: 'Loading Grafter' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Welcome to Grafter' })).toBeNull();

    snapshot.resolve(welcomeScenario.emptySnapshot);

    expect(
      await screen.findByRole('heading', { name: 'Welcome to Grafter' }),
    ).toBeVisible();
    expect(screen.queryByRole('status', { name: 'Loading Grafter' })).toBeNull();
  });

  it('shows the failure when the initial snapshot cannot be loaded', async () => {
    const user = userEvent.setup();
    renderApp(Promise.reject(new Error('Could not read window state.')));

    expect(await screen.findByText('Could not read window state.')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Loading Grafter' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Dismiss error' }));

    expect(screen.queryByText('Could not read window state.')).toBeNull();
  });

  it('prefers a pushed snapshot update over the initial snapshot response', async () => {
    const initial = deferred<AppSnapshot>();
    const publish = renderApp(initial.promise);
    stubRepositoryWindowApis(repositoryScenario.snapshot);

    act(() => publish(repositoryScenario.snapshot));

    expect(
      await screen.findByRole('button', {
        name: `${repositoryScenario.repository.name} repository details`,
      }),
    ).toBeVisible();

    act(() => initial.resolve(welcomeScenario.emptySnapshot));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Welcome to Grafter' })).toBeNull();
    });
    expect(
      screen.getByRole('button', {
        name: `${repositoryScenario.repository.name} repository details`,
      }),
    ).toBeVisible();
  });
});
