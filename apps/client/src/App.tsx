import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameRenderer } from './infra/render/GameRenderer.js';
import { Hud } from './ui/Hud.js';
import { Minimap } from './ui/Minimap.js';
import { MapEditor } from './editor/MapEditor.js';
import { StartScreen } from './ui/StartScreen.js';
import { loadMapCatalog } from './maps/mapCatalog.js';
import type { SkirmishConfig } from './game/skirmishConfig.js';
import './ui/game.css';

type Mode = 'menu' | 'game' | 'editor';

/** Root: switches between the live game and the map editor. */
export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('menu');
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [skirmish, setSkirmish] = useState<SkirmishConfig | null>(null);
  const maps = useMemo(() => loadMapCatalog(localStorage), [catalogRevision]);
  if (mode === 'menu') {
    return (
      <StartScreen
        maps={maps}
        onStart={(config) => {
          setSkirmish(config);
          setMode('game');
        }}
        onOpenEditor={() => setMode('editor')}
      />
    );
  }
  if (mode === 'editor') {
    return (
      <MapEditor
        onExit={() => {
          setCatalogRevision((current) => current + 1);
          setMode('menu');
        }}
      />
    );
  }
  if (!skirmish) {
    throw new Error('Game mode requires a skirmish configuration');
  }
  return <Game config={skirmish} onOpenEditor={() => setMode('editor')} />;
}

/**
 * The live game view. Mounts the Pixi/engine GameRenderer into a container div and
 * overlays the React HUD/minimap. Unmounting disposes the renderer (used when switching
 * to the editor). StrictMode double-invokes effects in dev, hence the duplicate guard.
 */
function Game({
  config,
  onOpenEditor,
}: {
  config: SkirmishConfig;
  onOpenEditor: () => void;
}): JSX.Element {
  const [session, setSession] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || rendererRef.current) return;
    const renderer = new GameRenderer(el);
    rendererRef.current = renderer;
    void renderer.start(config).then(() => renderer.attachMinimap(minimapCanvasRef.current));
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [config, session]);

  const attachMinimap = useCallback((c: HTMLCanvasElement | null) => {
    minimapCanvasRef.current = c;
    rendererRef.current?.attachMinimap(c);
  }, []);
  const minimapClick = useCallback((nx: number, ny: number) => {
    rendererRef.current?.centerFromMinimap(nx, ny);
  }, []);

  return (
    <div className="game-shell">
      <div ref={containerRef} className="game-canvas" />
      <Hud
        onQueueProduction={(unit) => rendererRef.current?.queueProduction(unit)}
        onCancelProduction={() => rendererRef.current?.cancelProduction()}
        onPlaceBuilding={(building) => rendererRef.current?.beginBuildingPlacement(building)}
        onCancelPlacement={() => rendererRef.current?.cancelBuildingPlacement()}
        onGather={() => rendererRef.current?.gatherWithSelectedHarvesters()}
        onStop={() => rendererRef.current?.stopSelectedUnits()}
        onOpenEditor={onOpenEditor}
        onRestart={() => setSession((current) => current + 1)}
      />
      <Minimap onCanvas={attachMinimap} onClick={minimapClick} />
    </div>
  );
}
