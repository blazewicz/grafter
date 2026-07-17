import { AlertTriangle, X } from 'lucide-react';
import styles from './ErrorToast.module.css';

export function ErrorToast({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss: () => void;
}): React.JSX.Element {
  return (
    <div className={styles.toast}>
      <AlertTriangle size={15} />
      <span>{message}</span>
      <button aria-label="Dismiss error" onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}
