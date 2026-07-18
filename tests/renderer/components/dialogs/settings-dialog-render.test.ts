import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AppSnapshot } from '../../../../src/shared/contracts';
import { SettingsDialog } from '../../../../src/renderer/components/dialogs/SettingsDialog';

describe('SettingsDialog date and time preferences', () => {
  it('renders the persisted choices and explains the fallback', () => {
    const snapshot: AppSnapshot = {
      homeDirectory: '/home/user',
      systemLocale: 'en-GB',
      projects: [],
      settings: {
        defaultWorktreePath: '../<repo_name>.worktrees',
        dateFormat: 'day-month-year',
        timeFormat: '24-hour',
      },
    };

    const html = renderToStaticMarkup(
      createElement(SettingsDialog, {
        snapshot,
        onClose: () => undefined,
        onSave: () => undefined,
        onProjectSetup: () => undefined,
      }),
    );

    expect(html).toContain('Date and time');
    expect(html).toContain('DD/MM/YYYY');
    expect(html).toContain('24-hour');
    expect(html).toContain('operating system’s regional preferences');
    expect(html).toContain('<option value="day-month-year" selected="">');
    expect(html).toContain('<option value="24-hour" selected="">');
  });
});
