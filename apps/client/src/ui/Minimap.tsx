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
    <div style={wrap}>
      <canvas
        ref={ref}
        width={192}
        height={192}
        style={{ width: 192, height: 192, display: 'block', borderRadius: 4 }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          onClick((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
      />
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 36,
  padding: 6,
  background: 'rgba(11,15,13,0.85)',
  border: '1px solid #2a4034',
  borderRadius: 6,
};
