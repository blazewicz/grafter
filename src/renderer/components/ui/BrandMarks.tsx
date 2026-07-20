import styles from './BrandMarks.module.css';

export function BranchMark(): React.JSX.Element {
  return (
    <svg width="18" height="19" viewBox="0 0 18 19" fill="none" aria-hidden="true">
      <path
        d="M4 3v9.4c0 2 1.1 3.1 3 3.1h2.2c2 0 3-1.1 3-3.1V7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="4" cy="3" r="2" fill="currentColor" />
      <circle cx="12.2" cy="5.5" r="2" fill="currentColor" />
      <circle cx="4" cy="15.5" r="2" fill="currentColor" />
    </svg>
  );
}

export function VisualStudioCodeMark(): React.JSX.Element {
  return (
    <svg
      className={styles.brandMark}
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      data-brand-mark="visual-studio-code"
      aria-hidden="true"
    >
      <rect width="20" height="20" rx="4" fill="#f7f7f8" />
      <path
        d="M14.4 2.9 8.1 8.5 5 6.2 2.8 8.2l3.1 2.8-3.1 2.8L5 15.9l3.1-2.3 6.3 5.5 2.8-1.35V4.25L14.4 2.9Zm0 4.15v7.9L10 11l4.4-3.95Z"
        fill="#168bd2"
      />
    </svg>
  );
}

export function FinderMark(): React.JSX.Element {
  return (
    <svg
      className={styles.brandMark}
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
      data-brand-mark="finder"
      aria-hidden="true"
    >
      <rect width="20" height="20" rx="4" fill="#79c8f2" />
      <path d="M4 0h6v20H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4Z" fill="#2598d2" />
      <path
        d="M10 0c0 3.45-1.7 5.55-1.7 8.35 0 1.22.32 2.08 1.05 2.85"
        stroke="#16324a"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <path
        d="M5.45 7.25v1.1M14.55 7.25v1.1"
        stroke="#16324a"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
      <path
        d="M5.15 12.45c1.25 1.55 2.82 2.3 4.85 2.3s3.6-.75 4.85-2.3"
        stroke="#16324a"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
