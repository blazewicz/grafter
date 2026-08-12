import styles from './HighlightedText.module.css';

export function HighlightedText({
  text,
  indexes,
}: {
  text: string;
  indexes: readonly number[];
}): React.JSX.Element {
  if (!indexes.length) return <>{text}</>;

  const matched = new Set(indexes);
  const segments: { text: string; matched: boolean }[] = [];
  let current = '';
  let currentMatched = false;
  for (let index = 0; index < text.length; index += 1) {
    const isMatched = matched.has(index);
    if (isMatched !== currentMatched) {
      if (current) segments.push({ text: current, matched: currentMatched });
      current = '';
      currentMatched = isMatched;
    }
    current += text[index];
  }
  if (current) segments.push({ text: current, matched: currentMatched });

  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className={styles.matchHighlight}>
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
