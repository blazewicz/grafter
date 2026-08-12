// @vitest-environment happy-dom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApprovalDialog } from '../../../src/renderer/dialogs/ApprovalDialog';
import { approvalRequestFactory } from '../../factories';

const homeDirectory = '/Users/developer';
const workingDirectory = `${homeDirectory}/Code/grafter`;
const request = approvalRequestFactory.build(
  {},
  {
    transient: {
      commandOverrides: { cwd: workingDirectory },
    },
  },
);

interface RenderApprovalDialogOptions {
  running?: boolean;
  onReject?: () => void;
  onApprove?: () => void;
}

function renderApprovalDialog(options: RenderApprovalDialogOptions = {}): void {
  render(
    <ApprovalDialog
      homeDirectory={homeDirectory}
      request={request}
      running={options.running ?? false}
      onReject={options.onReject ?? (() => undefined)}
      onApprove={options.onApprove ?? (() => undefined)}
    />,
  );
}

describe('ApprovalDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the warning and exact command under review', () => {
    renderApprovalDialog();

    expect(screen.getByRole('dialog', { name: 'Review command' })).toHaveAttribute(
      'aria-modal',
      'true',
    );
    expect(screen.getByText(request.warning)).toBeVisible();
    expect(
      screen.getByText(request.command.displayCommand, { selector: 'code' }),
    ).toBeVisible();
    expect(screen.getByText('~/Code/grafter', { selector: 'code' })).toBeVisible();
    expect(
      screen.getByText(
        'Approval applies only to this exact command. Any change requires a new review.',
      ),
    ).toBeVisible();
  });

  it('rejects the command', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onApprove = vi.fn();
    renderApprovalDialog({ onReject, onApprove });

    expect(screen.getByRole('button', { name: 'Don’t run' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Don’t run' }));

    expect(onReject).toHaveBeenCalledOnce();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('approves the command', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onApprove = vi.fn();
    renderApprovalDialog({ onReject, onApprove });

    expect(screen.getByRole('button', { name: 'Approve & run' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Approve & run' }));

    expect(onApprove).toHaveBeenCalledOnce();
    expect(onReject).not.toHaveBeenCalled();
  });

  it('shows execution progress and disables both actions while running', async () => {
    const user = userEvent.setup();
    const onReject = vi.fn();
    const onApprove = vi.fn();
    renderApprovalDialog({ running: true, onReject, onApprove });

    const rejectButton = screen.getByRole('button', { name: 'Don’t run' });
    const approveButton = screen.getByRole('button', { name: 'Running…' });

    expect(rejectButton).toBeDisabled();
    expect(approveButton).toBeDisabled();
    expect(approveButton).toHaveAttribute('aria-busy', 'true');
    expect(
      screen.queryByRole('button', { name: 'Approve & run' }),
    ).not.toBeInTheDocument();
    await user.click(rejectButton);
    await user.click(approveButton);

    expect(onReject).not.toHaveBeenCalled();
    expect(onApprove).not.toHaveBeenCalled();
  });
});
