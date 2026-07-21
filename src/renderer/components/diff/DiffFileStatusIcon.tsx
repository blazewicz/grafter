import { Copy, FileCog, FileDiff, FileMinus, FilePlus, FileSymlink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { DiffFileStatus } from '../../../shared/contracts';

export type DiffFileStatusTone = 'neutral' | 'positive' | 'negative';

export const diffFileStatusPresentation = {
  added: { icon: FilePlus, label: 'Added', tone: 'positive', color: 'var(--green)' },
  copied: { icon: Copy, label: 'Copied', tone: 'neutral', color: '#858791' },
  deleted: { icon: FileMinus, label: 'Deleted', tone: 'negative', color: 'var(--red)' },
  modified: { icon: FileDiff, label: 'Modified', tone: 'neutral', color: '#858791' },
  renamed: { icon: FileSymlink, label: 'Renamed', tone: 'neutral', color: '#858791' },
  'type-changed': {
    icon: FileCog,
    label: 'Type changed',
    tone: 'neutral',
    color: '#858791',
  },
} satisfies Record<
  DiffFileStatus,
  { icon: LucideIcon; label: string; tone: DiffFileStatusTone; color: string }
>;

export function DiffFileStatusIcon({
  status,
  size,
}: {
  status: DiffFileStatus;
  size: number;
}): React.JSX.Element {
  const presentation = diffFileStatusPresentation[status];
  const Icon = presentation.icon;
  return (
    <Icon
      size={size}
      aria-label={`${presentation.label} file`}
      style={{ color: presentation.color }}
      data-file-status={status}
      data-status-tone={presentation.tone}
      data-status-color={presentation.color}
    >
      <title>{`${presentation.label} file`}</title>
    </Icon>
  );
}
