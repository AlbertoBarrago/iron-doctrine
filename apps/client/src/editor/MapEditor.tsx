import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEmptyMap, validateMap, type MapDef } from '@iron/shared';
import { parseMapJson, saveLocalMap } from '../maps/mapCatalog.js';
import {
  brushCells,
  canvasBackingSize,
  clampZoom,
  movePlayerSpawn,
  pointToCell,
  type GridCell,
} from './mapEditorModel.js';

type Tool = 'wall' | 'erase' | 'resource' | 'spawn';

const BRUSH_SIZES = [1, 3, 5] as const;
const TOOLS: ReadonlyArray<{ id: Tool; symbol: string; label: string; description: string }> = [
  { id: 'wall', symbol: '▦', label: 'Blocked terrain', description: 'Paint impassable cells' },
  { id: 'erase', symbol: '⌫', label: 'Clear cell', description: 'Remove terrain and objects' },
  { id: 'resource', symbol: '◆', label: 'Ore field', description: 'Place a 5,000 ore deposit' },
  {
    id: 'spawn',
    symbol: '★',
    label: 'Player spawn',
    description: 'Move the selected player start',
  },
];

const keyOf = (x: number, y: number): string => `${x},${y}`;

/** Full-screen client-side map authoring workspace. */
export function MapEditor({ onExit }: { onExit: () => void }): JSX.Element {
  const [map, setMap] = useState<MapDef>(() => {
    const initial = createEmptyMap('untitled-operation', 48, 48);
    initial.spawns.push({ player: 0, x: 4, y: 4 }, { player: 1, x: 43, y: 43 });
    return initial;
  });
  const [tool, setTool] = useState<Tool>('wall');
  const [spawnPlayer, setSpawnPlayer] = useState<0 | 1>(0);
  const [brushSize, setBrushSize] = useState<(typeof BRUSH_SIZES)[number]>(1);
  const [zoom, setZoom] = useState(1);
  const [fitSize, setFitSize] = useState(720);
  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [storageStatus, setStorageStatus] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const painting = useRef(false);
  const lastPainted = useRef<string | null>(null);
  const validationErrors = useMemo(() => validateMap(map), [map]);
  const displaySize = Math.round(fitSize * zoom);
  const backingSize = canvasBackingSize(displaySize, globalThis.devicePixelRatio ?? 1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = (): void => {
      setFitSize(Math.max(320, Math.min(viewport.clientWidth - 48, viewport.clientHeight - 48)));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const cellWidth = backingSize / map.width;
    const cellHeight = backingSize / map.height;

    ctx.fillStyle = '#2d3827';
    ctx.fillRect(0, 0, backingSize, backingSize);
    for (let cy = 0; cy < map.height; cy++) {
      for (let cx = 0; cx < map.width; cx++) {
        const hash = Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663);
        if ((hash & 3) === 0) {
          ctx.fillStyle = (hash & 4) === 0 ? '#35402c' : '#293323';
          ctx.fillRect(cx * cellWidth, cy * cellHeight, cellWidth + 1, cellHeight + 1);
        }
      }
    }

    ctx.fillStyle = '#171a14';
    for (const [cx, cy] of map.blocked) {
      ctx.fillRect(cx * cellWidth, cy * cellHeight, cellWidth, cellHeight);
      ctx.strokeStyle = '#555943';
      ctx.strokeRect(cx * cellWidth + 2, cy * cellHeight + 2, cellWidth - 4, cellHeight - 4);
    }

    for (const resource of map.resources) {
      const centerX = (resource.x + 0.5) * cellWidth;
      const centerY = (resource.y + 0.5) * cellHeight;
      ctx.fillStyle = '#c2912f';
      ctx.strokeStyle = '#574019';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - cellHeight * 0.42);
      ctx.lineTo(centerX + cellWidth * 0.42, centerY);
      ctx.lineTo(centerX, centerY + cellHeight * 0.42);
      ctx.lineTo(centerX - cellWidth * 0.42, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    for (const spawn of map.spawns) {
      const centerX = (spawn.x + 0.5) * cellWidth;
      const centerY = (spawn.y + 0.5) * cellHeight;
      ctx.fillStyle = spawn.player === 0 ? '#d0b94f' : '#b2452f';
      ctx.strokeStyle = '#11140f';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.min(cellWidth, cellHeight) * 0.44, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#17160e';
      ctx.font = `bold ${Math.max(10, cellHeight * 0.55)}px Arial Narrow`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(spawn.player + 1), centerX, centerY + 1);
    }

    ctx.strokeStyle = 'rgba(197, 186, 132, .16)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= map.width; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cellWidth, 0);
      ctx.lineTo(x * cellWidth, backingSize);
      ctx.stroke();
    }
    for (let y = 0; y <= map.height; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cellHeight);
      ctx.lineTo(backingSize, y * cellHeight);
      ctx.stroke();
    }

    if (hoveredCell) {
      const preview =
        tool === 'wall' || tool === 'erase'
          ? brushCells(hoveredCell, brushSize, map.width, map.height)
          : [hoveredCell];
      ctx.fillStyle = tool === 'erase' ? 'rgba(180,65,45,.34)' : 'rgba(240,204,104,.28)';
      ctx.strokeStyle = tool === 'erase' ? '#dc5a42' : '#f0cc68';
      ctx.lineWidth = 2;
      for (const cell of preview) {
        ctx.fillRect(cell.cx * cellWidth, cell.cy * cellHeight, cellWidth, cellHeight);
        ctx.strokeRect(
          cell.cx * cellWidth + 1,
          cell.cy * cellHeight + 1,
          cellWidth - 2,
          cellHeight - 2,
        );
      }
    }
  }, [backingSize, brushSize, hoveredCell, map, tool]);

  useEffect(() => draw(), [draw]);

  const eventCell = (event: React.PointerEvent<HTMLCanvasElement>): GridCell => {
    const rect = event.currentTarget.getBoundingClientRect();
    return pointToCell(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
      map.width,
      map.height,
    );
  };

  const apply = (center: GridCell): void => {
    if (center.cx < 0 || center.cy < 0 || center.cx >= map.width || center.cy >= map.height) return;
    const cells =
      tool === 'wall' || tool === 'erase'
        ? brushCells(center, brushSize, map.width, map.height)
        : [center];
    const affected = new Set(cells.map((cell) => keyOf(cell.cx, cell.cy)));

    setMap((previous) => {
      const next: MapDef = structuredClone(previous);
      const blocked = new Set(next.blocked.map(([x, y]) => keyOf(x, y)));
      if (tool === 'wall') {
        for (const cell of cells) blocked.add(keyOf(cell.cx, cell.cy));
        next.resources = next.resources.filter(
          (resource) => !affected.has(keyOf(resource.x, resource.y)),
        );
        next.spawns = next.spawns.filter((spawn) => !affected.has(keyOf(spawn.x, spawn.y)));
      } else if (tool === 'erase') {
        for (const cell of cells) blocked.delete(keyOf(cell.cx, cell.cy));
        next.resources = next.resources.filter(
          (resource) => !affected.has(keyOf(resource.x, resource.y)),
        );
        next.spawns = next.spawns.filter((spawn) => !affected.has(keyOf(spawn.x, spawn.y)));
      } else if (tool === 'resource') {
        blocked.delete(keyOf(center.cx, center.cy));
        next.spawns = next.spawns.filter(
          (spawn) => keyOf(spawn.x, spawn.y) !== keyOf(center.cx, center.cy),
        );
        if (
          !next.resources.some((resource) => resource.x === center.cx && resource.y === center.cy)
        ) {
          next.resources.push({ x: center.cx, y: center.cy, amount: 5000 });
        }
      } else {
        blocked.delete(keyOf(center.cx, center.cy));
        next.resources = next.resources.filter(
          (resource) => keyOf(resource.x, resource.y) !== keyOf(center.cx, center.cy),
        );
        next.spawns = movePlayerSpawn(next.spawns, spawnPlayer, center);
      }
      next.blocked = [...blocked].map((key) => key.split(',').map(Number) as [number, number]);
      return next;
    });
  };

  const exportJson = (): void => {
    if (validationErrors.length) {
      alert(`Map invalid:\n${validationErrors.join('\n')}`);
      return;
    }
    const blob = new Blob([JSON.stringify(map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${map.name || 'map'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveMap = (): void => {
    try {
      saveLocalMap(localStorage, map);
      setStorageStatus(`Saved locally: ${map.name}`);
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : 'Unable to save map');
    }
  };

  const importJson = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      const imported = parseMapJson(await file.text());
      setMap(imported);
      setStorageStatus(`Imported: ${imported.name}`);
    } catch (error) {
      setStorageStatus(error instanceof Error ? error.message : 'Unable to import map');
    }
  };

  const changeZoom = (delta: number): void => setZoom((current) => clampZoom(current + delta));

  return (
    <main className="editor-shell">
      <header className="editor-topbar steel-panel">
        <div className="editor-brand">
          <span>ID</span>
          <div>
            <small>FIELD ENGINEERING</small>
            <strong>MAP FORGE</strong>
          </div>
        </div>
        <label className="editor-name">
          <span>OPERATION NAME</span>
          <input
            value={map.name}
            onChange={(event) => setMap((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <div className="editor-summary">
          <span>
            {map.width} × {map.height}
          </span>
          <span>{map.blocked.length} BLOCKED</span>
          <span>{map.resources.length} ORE</span>
          <span>{map.spawns.length} SPAWNS</span>
        </div>
        <div className="editor-topbar__spacer" />
        <div className={`editor-validation ${validationErrors.length ? 'is-invalid' : ''}`}>
          <i />
          {validationErrors.length ? `${validationErrors.length} ISSUES` : 'MAP VALID'}
        </div>
        {storageStatus ? <span className="editor-storage-status">{storageStatus}</span> : null}
        <button className="metal-button metal-button--primary" onClick={saveMap}>
          Save level
        </button>
        <label className="metal-button editor-import">
          Import JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importJson(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>
        <button className="metal-button metal-button--primary" onClick={exportJson}>
          Export JSON
        </button>
        <button className="metal-button" onClick={onExit}>
          Exit editor
        </button>
      </header>

      <aside className="editor-tools steel-panel">
        <div className="hazard-stripe" />
        <span className="panel-kicker">TERRAIN CONTROL</span>
        <h2>Tool palette</h2>
        <div className="editor-tool-list">
          {TOOLS.map((candidate) => (
            <button
              key={candidate.id}
              className={`editor-tool${tool === candidate.id ? ' is-active' : ''}`}
              onClick={() => setTool(candidate.id)}
            >
              <span>{candidate.symbol}</span>
              <div>
                <strong>{candidate.label}</strong>
                <small>{candidate.description}</small>
              </div>
            </button>
          ))}
        </div>
        <div className="panel-separator">
          <span />
        </div>
        {tool === 'spawn' ? (
          <>
            <span className="panel-kicker">SPAWN OWNER</span>
            <div className="editor-spawn-players">
              <button
                className={spawnPlayer === 0 ? 'is-active friendly' : ''}
                onClick={() => setSpawnPlayer(0)}
              >
                PLAYER 1
              </button>
              <button
                className={spawnPlayer === 1 ? 'is-active hostile' : ''}
                onClick={() => setSpawnPlayer(1)}
              >
                PLAYER 2
              </button>
            </div>
          </>
        ) : tool === 'wall' || tool === 'erase' ? (
          <>
            <span className="panel-kicker">BRUSH SIZE</span>
            <div className="editor-brushes">
              {BRUSH_SIZES.map((size) => (
                <button
                  key={size}
                  className={brushSize === size ? 'is-active' : ''}
                  onClick={() => setBrushSize(size)}
                >
                  {size} × {size}
                </button>
              ))}
            </div>
          </>
        ) : null}
        <div className="editor-legend">
          <span>
            <i className="friendly" />
            Friendly spawn
          </span>
          <span>
            <i className="hostile" />
            Hostile spawn
          </span>
          <span>
            <i className="ore" />
            Ore field
          </span>
          <span>
            <i className="blocked" />
            Blocked terrain
          </span>
        </div>
      </aside>

      <section className="editor-workspace">
        <div className="editor-workspace__bar steel-panel">
          <div className="editor-coordinates">
            CELL{' '}
            <strong>
              {hoveredCell
                ? `${hoveredCell.cx.toString().padStart(2, '0')} : ${hoveredCell.cy.toString().padStart(2, '0')}`
                : '-- : --'}
            </strong>
          </div>
          <div className="editor-zoom">
            <button onClick={() => changeZoom(-0.25)}>−</button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => changeZoom(0.25)}>+</button>
            <button onClick={() => setZoom(1)}>FIT MAP</button>
          </div>
        </div>
        <div
          ref={viewportRef}
          className="editor-viewport"
          onWheel={(event) => {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            changeZoom(event.deltaY < 0 ? 0.25 : -0.25);
          }}
        >
          <div
            className="editor-canvas-stage"
            style={{ width: displaySize + 36, height: displaySize + 36 }}
          >
            <canvas
              ref={canvasRef}
              width={backingSize}
              height={backingSize}
              className="editor-canvas"
              style={{ width: displaySize, height: displaySize }}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                painting.current = true;
                lastPainted.current = null;
                const cell = eventCell(event);
                setHoveredCell(cell);
                apply(cell);
                lastPainted.current = keyOf(cell.cx, cell.cy);
              }}
              onPointerMove={(event) => {
                const cell = eventCell(event);
                setHoveredCell(cell);
                if (!painting.current || tool === 'spawn' || tool === 'resource') return;
                const key = keyOf(cell.cx, cell.cy);
                if (key === lastPainted.current) return;
                apply(cell);
                lastPainted.current = key;
              }}
              onPointerUp={(event) => {
                painting.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onPointerCancel={() => {
                painting.current = false;
              }}
              onPointerLeave={() => {
                if (!painting.current) setHoveredCell(null);
              }}
            />
          </div>
        </div>
      </section>

      <aside className="editor-inspector steel-panel">
        <span className="panel-kicker">MAP INTELLIGENCE</span>
        <h2>Operation data</h2>
        <dl>
          <div>
            <dt>Dimensions</dt>
            <dd>
              {map.width} × {map.height}
            </dd>
          </div>
          <div>
            <dt>Passable cells</dt>
            <dd>{map.width * map.height - map.blocked.length}</dd>
          </div>
          <div>
            <dt>Ore capacity</dt>
            <dd>
              {map.resources.reduce((sum, resource) => sum + resource.amount, 0).toLocaleString()}
            </dd>
          </div>
          <div>
            <dt>Player positions</dt>
            <dd>{map.spawns.length}</dd>
          </div>
        </dl>
        <div className="panel-separator">
          <span />
        </div>
        <span className="panel-kicker">VALIDATION</span>
        {validationErrors.length ? (
          <ul className="editor-errors">
            {validationErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <div className="editor-valid">
            <i />
            Ready for deployment
          </div>
        )}
        <div className="editor-help">
          <strong>Navigation</strong>
          <p>Use the mouse wheel to scroll the viewport. Hold Ctrl or ⌘ while scrolling to zoom.</p>
        </div>
      </aside>
    </main>
  );
}
