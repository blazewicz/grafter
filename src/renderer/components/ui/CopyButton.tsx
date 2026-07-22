import { Check, Copy } from 'lucide-react';
import styles from './CopyButton.module.css';

export function CopyButton({
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
  className,
  compact = false,
  iconSize,
}: {
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
  className?: string | undefined;
  compact?: boolean;
  iconSize?: number | undefined;
}): React.JSX.Element {
  const buttonClassName = [
    styles.copyButton,
    compact ? styles.compact : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={buttonClassName}
      aria-label={copied ? copiedLabel : copyLabel}
      title={copied ? copiedLabel : copyLabel}
      onClick={onCopy}
    >
      {copied ? (
        <Check size={iconSize ?? (compact ? 12 : 13)} />
      ) : (
        <Copy size={iconSize ?? (compact ? 12 : 13)} />
      )}
    </button>
  );
}
