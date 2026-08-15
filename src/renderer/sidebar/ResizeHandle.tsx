import { useRef } from 'react';
import styles from './sidebar.module.css';

const minimumSidebarWidth = 230;
const maximumSidebarWidth = 480;
export const defaultSidebarWidth = 292;
const keyboardResizeStep = 16;

export function ResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}): React.JSX.Element {
  const resizeStart = useRef<
    | {
        pointerId: number;
        pointerX: number;
        width: number;
      }
    | undefined
  >(undefined);

  const resizeTo = (nextWidth: number): void => {
    onResize(Math.min(maximumSidebarWidth, Math.max(minimumSidebarWidth, nextWidth)));
  };

  return (
    <div
      className={styles.sidebarResizeHandle}
      role="separator"
      aria-label="Resize repository sidebar"
      aria-controls="sidebar"
      aria-orientation="vertical"
      aria-valuemin={minimumSidebarWidth}
      aria-valuemax={maximumSidebarWidth}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize · Double-click to reset"
      onDoubleClick={() => resizeTo(defaultSidebarWidth)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          resizeTo(width - keyboardResizeStep);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          resizeTo(width + keyboardResizeStep);
        } else if (event.key === 'Home') {
          event.preventDefault();
          resizeTo(defaultSidebarWidth);
        }
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        resizeStart.current = {
          pointerId: event.pointerId,
          pointerX: event.clientX,
          width,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = resizeStart.current;
        if (start?.pointerId !== event.pointerId) return;
        resizeTo(start.width + event.clientX - start.pointerX);
      }}
      onPointerUp={(event) => {
        if (resizeStart.current?.pointerId !== event.pointerId) return;
        resizeStart.current = undefined;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        resizeStart.current = undefined;
      }}
    />
  );
}
