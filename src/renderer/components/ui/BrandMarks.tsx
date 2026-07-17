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
      className={styles.vscodeMark}
      width="17"
      height="17"
      viewBox="0 0 20 20"
      fill="none"
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
