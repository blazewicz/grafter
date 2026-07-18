import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppTitlebar } from '../../../../src/renderer/components/shell/AppTitlebar';

describe('AppTitlebar', () => {
  it('keeps repository context and refresh while omitting duplicate branding and settings', () => {
    const html = renderToStaticMarkup(
      createElement(AppTitlebar, {
        projectName: 'grafter',
        branchName: 'main',
        busy: false,
        onRefresh: () => undefined,
      }),
    );

    expect(html).toContain('grafter');
    expect(html).toContain('main');
    expect(html).toContain('aria-label="Refresh repositories"');
    expect(html).not.toContain('Grafter');
    expect(html).not.toContain('Open settings');
  });
});
