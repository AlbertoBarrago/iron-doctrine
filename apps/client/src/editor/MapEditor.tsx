import { useCallback, useEffect, useRef, useState } from 'react';
import { createEmptyMap, validateMap, type MapDef } from '@iron/shared';

type Tool = 'wall' | 'erase' | 'resource' | 'spawn';

const CANVAS = 640;

/**
 * In-browser map editor. Paints terrain passability, places resource nodes and player
 * spawns onto a grid, validates, and exports a MapDef JSON compatible with the engine's
 * match loader. Purely client-side; no server round-trip.
 */
export function MapEditor({ onExit }: { onExit: () => void }): JSX.Element {
  const [map, setMap] = useState<MapDef>(() => {
    const m = createEmptyMap('untitled', 48, 48);
    m.spawns.push({ player: 0, x: 4, y: 4 });
    m.spawns.push({ player: 1, x: 43, y: 43 });
    return m;
  });
  const [tool, setTool] = useState<Tool>('wall');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);

  const cell = CANVAS / Math.max(map.width, map.height);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#0b0f0d';
    ctx.fillRect(0, 0, CANVAS, CANVAS);

    ctx.strokeStyle = '#16241d';
    for (let x = 0; x <= map.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cell, 0);
      ctx.lineTo(x * cell, map.height * cell);
      ctx.stroke();
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cell);
      ctx.lineTo(map.width * cell, y * cell);
      ctx.stroke();
    }

    ctx.fillStyle = '#3b4a41';
    for (const [cx, cy] of map.blocked) ctx.fillRect(cx * cell, cy * cell, cell, cell);

    ctx.fillStyle = '#8b6f2e';
    for (const r of map.resources) {
      ctx.fillRect(r.x * cell, r.y * cell, cell, cell);
    }

    for (const s of map.spawns) {
      ctx.fillStyle = s.player === 0 ? '#4ade80' : '#f87171';
      ctx.beginPath();
      ctx.arc((s.x + 0.5) * cell, (s.y + 0.5) * cell, cell * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [map, cell]);

  useEffect(() => {
    draw();
  }, [draw]);

  const cellAt = (e: React.PointerEvent): { cx: number; cy: number } => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      cx: Math.floor(((e.clientX - rect.left) / rect.width) * (CANVAS / cell)),
      cy: Math.floor(((e.clientY - rect.top) / rect.height) * (CANVAS / cell)),
    };
  };

  const apply = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= map.width || cy >= map.height) return;
    setMap((prev) => {
      const next: MapDef = structuredClone(prev);
      const key = (x: number, y: number) => `${x},${y}`;
      switch (tool) {
        case 'wall':
          if (!next.blocked.some(([x, y]) => key(x, y) === key(cx, cy))) next.blocked.push([cx, cy]);
          break;
        case 'erase':
          next.blocked = next.blocked.filter(([x, y]) => key(x, y) !== key(cx, cy));
          next.resources = next.resources.filter((r) => key(r.x, r.y) !== key(cx, cy));
          break;
        case 'resource':
          if (!next.resources.some((r) => key(r.x, r.y) === key(cx, cy))) {
            next.resources.push({ x: cx, y: cy, amount: 5000 });
          }
          break;
        case 'spawn': {
          const player = next.spawns.length % 2;
          next.spawns.push({ player, x: cx, y: cy });
          break;
        }
      }
      return next;
    });
  };

  const exportJson = (): void => {
    const errors = validateMap(map);
    if (errors.length) {
      alert(`Map invalid:\n${errors.join('\n')}`);
      return;
    }
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${map.name || 'map'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={root}>
      <div style={toolbar}>
        <strong style={{ color: '#dff5ea' }}>Map Editor</strong>
        <input
          style={input}
          value={map.name}
          onChange={(e) => setMap((m) => ({ ...m, name: e.target.value }))}
        />
        {(['wall', 'erase', 'resource', 'spawn'] as const).map((t) => (
          <button key={t} onClick={() => setTool(t)} style={tool === t ? btnActive : btn}>
            {t}
          </button>
        ))}
        <span style={{ color: '#5f7568' }}>
          {map.width}×{map.height} · walls {map.blocked.length} · ore {map.resources.length} · spawns{' '}
          {map.spawns.length}
        </span>
        <div style={{ flex: 1 }} />
        <button onClick={exportJson} style={btn}>
          Export JSON
        </button>
        <button onClick={onExit} style={btn}>
          Back to game
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS}
        height={CANVAS}
        style={{ background: '#0b0f0d', border: '1px solid #2a4034', touchAction: 'none' }}
        onPointerDown={(e) => {
          painting.current = true;
          const { cx, cy } = cellAt(e);
          apply(cx, cy);
        }}
        onPointerMove={(e) => {
          if (!painting.current || tool === 'spawn') return;
          const { cx, cy } = cellAt(e);
          apply(cx, cy);
        }}
        onPointerUp={() => (painting.current = false)}
        onPointerLeave={() => (painting.current = false)}
      />
    </div>
  );
}

const font = "ui-monospace, 'SF Mono', Menlo, monospace";
const root: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 16,
  background: '#0b0f0d',
  fontFamily: font,
  alignItems: 'flex-start',
};
const toolbar: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', width: '100%' };
const btn: React.CSSProperties = {
  padding: '6px 12px',
  background: '#14201b',
  color: '#dff5ea',
  border: '1px solid #2a4034',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: font,
  textTransform: 'capitalize',
};
const btnActive: React.CSSProperties = { ...btn, background: '#2a4034', borderColor: '#4ade80' };
const input: React.CSSProperties = {
  padding: '6px 10px',
  background: '#0e1613',
  color: '#dff5ea',
  border: '1px solid #2a4034',
  borderRadius: 6,
  fontFamily: font,
};
