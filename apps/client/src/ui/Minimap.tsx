import { useEffect, useRef } from 'react';

/**
 * Minimap surface. The component only owns the <canvas>; the GameRenderer draws blips,
 * fog and the camera viewport onto it each frame (throttled). Clicking recenters the
 * camera via the provided callback.
 */
export function Minimap({
  onCanvas,
  onClick,
}: {
  onCanvas: (canvas: HTMLCanvasElement | null) => void;
  onClick: (nx: number, ny: number) => void;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);

  const navigate = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
    onClick(nx, ny);
  };

  useEffect(() => {
    onCanvas(ref.current);
    return () => onCanvas(null);
  }, [onCanvas]);

  return (
    <div className="minimap-frame steel-panel">
      <div className="minimap-frame__header">
        <span>TACTICAL RADAR</span>
        <span>ONLINE</span>
      </div>
      <div className="minimap-frame__screen">
        <canvas
          ref={ref}
          width={192}
          height={192}
          aria-label="Tactical radar; click or drag to move camera"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            navigate(event);
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.preventDefault();
            event.stopPropagation();
            navigate(event);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
          }}
        />
      </div>
      <div className="minimap-frame__footer">
        <span>SECTOR 7G</span>
        <span>ZOOM 1:5000</span>
      </div>
    </div>
  );
}
