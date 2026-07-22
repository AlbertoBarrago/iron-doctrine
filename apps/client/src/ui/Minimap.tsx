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
          aria-label="Tactical radar; click to move camera"
          onPointerDown={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
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
