import { useGameStore } from '../state/gameStore.js';

/** Top-bar HUD: resources, power, FPS, entity/selection counters and a build menu. */
export function Hud({
  onSpawn,
  onOpenEditor,
}: {
  onSpawn: (unit: string) => void;
  onOpenEditor: () => void;
}): JSX.Element {
  const { fps, entityCount, selectedCount, credits, power } = useGameStore();

  return (
    <>
      <div style={topBar}>
        <Stat label="Credits" value={`$${credits}`} />
        <Stat label="Power" value={`${power.produced}/${power.consumed}`} />
        <Stat label="Units" value={String(entityCount)} />
        <Stat label="Selected" value={String(selectedCount)} />
        <Stat label="FPS" value={String(fps)} />
        <div style={{ flex: 1 }} />
        <button style={{ ...buildBtn, pointerEvents: 'auto' }} onClick={onOpenEditor}>
          Map Editor
        </button>
      </div>

      <div style={buildMenu}>
        {(['rifleman', 'engineer', 'tank', 'harvester'] as const).map((u) => (
          <button key={u} style={buildBtn} onClick={() => onSpawn(u)}>
            {u}
          </button>
        ))}
      </div>

      <div style={hint}>
        Left-drag: select · Right-click: move · Wheel: zoom · WASD/Arrows: pan
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 64 }}>
      <span style={{ fontSize: 10, color: '#5f7568', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 16, color: '#dff5ea', fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const font = "ui-monospace, 'SF Mono', Menlo, monospace";

const topBar: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 56,
  display: 'flex',
  gap: 24,
  alignItems: 'center',
  padding: '0 20px',
  background: 'linear-gradient(180deg, rgba(11,15,13,0.95), rgba(11,15,13,0.6))',
  borderBottom: '1px solid #1c2b24',
  fontFamily: font,
  pointerEvents: 'none',
};

const buildMenu: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 72,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  fontFamily: font,
};

const buildBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#14201b',
  color: '#dff5ea',
  border: '1px solid #2a4034',
  borderRadius: 6,
  cursor: 'pointer',
  textTransform: 'capitalize',
  fontFamily: font,
};

const hint: React.CSSProperties = {
  position: 'absolute',
  bottom: 10,
  left: 12,
  color: '#5f7568',
  fontSize: 12,
  fontFamily: font,
  pointerEvents: 'none',
};
