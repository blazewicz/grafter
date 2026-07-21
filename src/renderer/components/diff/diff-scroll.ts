export interface DiffScrollGeometry {
  paneTop: number;
  targetTop: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollPaddingTop: number;
}

export function calculateDiffScrollCorrection({
  paneTop,
  targetTop,
  scrollTop,
  scrollHeight,
  clientHeight,
  scrollPaddingTop,
}: DiffScrollGeometry): number {
  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  const desiredScrollTop = Math.min(
    maximumScrollTop,
    Math.max(0, scrollTop + targetTop - paneTop - scrollPaddingTop),
  );
  return desiredScrollTop - scrollTop;
}
