import { useGameStore } from '../state/gameStore.js';
import { UNIT_STATS } from '@iron/engine';

/** Top-bar HUD: resources, power, FPS, entity/selection counters and a build menu. */
export function Hud({
  onQueueProduction,
  onCancelProduction,
  onOpenEditor,
  onRestart,
}: {
  onQueueProduction: (unit: string) => void;
  onCancelProduction: () => void;
  onOpenEditor: () => void;
  onRestart: () => void;
}): JSX.Element {
  const { fps, entityCount, selectedCount, credits, power, selectedProduction, match } =
    useGameStore();
  const progress = selectedProduction?.currentBuildTicks
    ? Math.min(100, (selectedProduction.progressTicks / selectedProduction.currentBuildTicks) * 100)
    : 0;

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

      <div style={productionPanel}>
        {selectedProduction ? (
          <>
            <strong style={panelTitle}>
              {selectedProduction.buildingType.replaceAll('_', ' ')}
            </strong>
            {selectedProduction.produces.map((unit) => {
              const stats = UNIT_STATS[unit];
              const affordable = stats !== undefined && credits >= stats.cost;
              return (
                <button
                  key={unit}
                  style={{ ...buildBtn, opacity: affordable ? 1 : 0.5 }}
                  disabled={!affordable}
                  onClick={() => onQueueProduction(unit)}
                >
                  {unit} · ${stats?.cost ?? '?'}
                </button>
              );
            })}
            <div style={queueText}>
              Queue:{' '}
              {selectedProduction.queue.length > 0 ? selectedProduction.queue.join(' → ') : 'empty'}
            </div>
            <div style={progressTrack}>
              <div style={{ ...progressFill, width: `${progress}%` }} />
            </div>
            <button
              style={buildBtn}
              disabled={selectedProduction.queue.length === 0}
              onClick={onCancelProduction}
            >
              Cancel last
            </button>
          </>
        ) : (
          <span style={queueText}>Select a barracks or factory to produce units.</span>
        )}
      </div>

      <div style={hint}>
        Left-drag: select · Right-click: move/rally · Wheel: zoom · WASD/Arrows: pan
      </div>

      {match?.status === 'finished' && (
        <div style={matchOverlay}>
          <div style={matchDialog}>
            <strong style={matchTitle}>
              {match.winner === 0 ? 'Victory' : match.winner === null ? 'Draw' : 'Defeat'}
            </strong>
            <span style={matchMessage}>
              {match.winner === 0
                ? 'Enemy command has been eliminated.'
                : match.winner === null
                  ? 'Both command structures were destroyed.'
                  : 'Your command structure has been destroyed.'}
            </span>
            <button style={buildBtn} onClick={onRestart}>
              Restart skirmish
            </button>
          </div>
        </div>
      )}
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

const productionPanel: React.CSSProperties = {
  position: 'absolute',
  right: 12,
  top: 72,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  width: 220,
  padding: 12,
  background: 'rgba(11,15,13,0.92)',
  border: '1px solid #2a4034',
  borderRadius: 6,
  fontFamily: font,
};

const panelTitle: React.CSSProperties = {
  color: '#dff5ea',
  textTransform: 'capitalize',
};

const queueText: React.CSSProperties = {
  color: '#8da99a',
  fontSize: 11,
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
};

const progressTrack: React.CSSProperties = {
  height: 5,
  overflow: 'hidden',
  background: '#1c2b24',
  borderRadius: 3,
};

const progressFill: React.CSSProperties = {
  height: '100%',
  background: '#4ade80',
};

const matchOverlay: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(5,8,7,0.7)',
  pointerEvents: 'auto',
  fontFamily: font,
};

const matchDialog: React.CSSProperties = {
  display: 'flex',
  width: 360,
  flexDirection: 'column',
  gap: 18,
  padding: 32,
  textAlign: 'center',
  background: '#0b0f0d',
  border: '1px solid #4ade80',
  borderRadius: 8,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

const matchTitle: React.CSSProperties = {
  color: '#dff5ea',
  fontSize: 32,
  textTransform: 'uppercase',
  letterSpacing: 4,
};

const matchMessage: React.CSSProperties = {
  color: '#8da99a',
  fontSize: 13,
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
