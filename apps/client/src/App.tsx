import { useCallback, useEffect, useRef, useState } from 'react';
import { GameRenderer } from './infra/render/GameRenderer.js';
import { Hud } from './ui/Hud.js';
import { Minimap } from './ui/Minimap.js';
import { MapEditor } from './editor/MapEditor.js';

type Mode = 'game' | 'editor';

/** Root: switches between the live game and the map editor. */
export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('game');
  return mode === 'game' ? (
    <Game onOpenEditor={() => setMode('editor')} />
  ) : (
    <MapEditor onExit={() => setMode('game')} />
  );
}

/**
 * The live game view. Mounts the Pixi/engine GameRenderer into a container div and
 * overlays the React HUD/minimap. Unmounting disposes the renderer (used when switching
 * to the editor). StrictMode double-invokes effects in dev, hence the duplicate guard.
 */
function Game({ onOpenEditor }: { onOpenEditor: () => void }): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || rendererRef.current) return;
    const renderer = new GameRenderer(el);
    rendererRef.current = renderer;
    void renderer.start().then(() => renderer.attachMinimap(minimapCanvasRef.current));
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  const attachMinimap = useCallback((c: HTMLCanvasElement | null) => {
    minimapCanvasRef.current = c;
    rendererRef.current?.attachMinimap(c);
  }, []);
  const minimapClick = useCallback((nx: number, ny: number) => {
    rendererRef.current?.centerFromMinimap(nx, ny);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <Hud onSpawn={(unit) => rendererRef.current?.spawn(unit)} onOpenEditor={onOpenEditor} />
      <Minimap onCanvas={attachMinimap} onClick={minimapClick} />
    </div>
  );
}
