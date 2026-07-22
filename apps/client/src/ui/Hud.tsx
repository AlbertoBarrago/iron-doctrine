import { BUILDING_STATS, UNIT_STATS } from '@iron/engine';
import { useGameStore, type TutorialStep } from '../state/gameStore.js';

const BUILDABLE_STRUCTURES = [
  { id: 'power_plant', label: 'Power plant', purpose: 'Provides 100 power' },
  { id: 'refinery', label: 'Refinery', purpose: 'Processes harvested ore' },
  { id: 'barracks', label: 'Barracks', purpose: 'Produces infantry' },
  { id: 'factory', label: 'War factory', purpose: 'Produces vehicles' },
  { id: 'turret', label: 'Defense turret', purpose: 'Automated base defense' },
] as const;

const TUTORIAL: Record<TutorialStep, { number: string; title: string; instruction: string }> = {
  select: {
    number: '1 / 5',
    title: 'Select your forces',
    instruction: 'Left-click a green unit or drag a selection box.',
  },
  move: {
    number: '2 / 5',
    title: 'Issue a move order',
    instruction: 'Right-click open terrain with units selected.',
  },
  build: {
    number: '3 / 5',
    title: 'Expand the base',
    instruction: 'Choose a structure in the Build section, then place it on green terrain.',
  },
  produce: {
    number: '4 / 5',
    title: 'Produce a unit',
    instruction: 'Select your barracks or war factory, then queue a reinforcement.',
  },
  attack: {
    number: '5 / 5',
    title: 'Engage the enemy',
    instruction: 'Select combat units and right-click a red enemy.',
  },
  complete: {
    number: 'READY',
    title: 'Field command online',
    instruction: 'Destroy the red construction yard while defending your own.',
  },
};

interface HudProps {
  onQueueProduction(unit: string): void;
  onCancelProduction(): void;
  onPlaceBuilding(building: string): void;
  onCancelPlacement(): void;
  onOpenEditor(): void;
  onRestart(): void;
}

/** Readable command surface and progressive first-match guidance. */
export function Hud({
  onQueueProduction,
  onCancelProduction,
  onPlaceBuilding,
  onCancelPlacement,
  onOpenEditor,
  onRestart,
}: HudProps): JSX.Element {
  const fps = useGameStore((state) => state.fps);
  const entityCount = useGameStore((state) => state.entityCount);
  const credits = useGameStore((state) => state.credits);
  const power = useGameStore((state) => state.power);
  const selectedEntity = useGameStore((state) => state.selectedEntity);
  const selectedProduction = useGameStore((state) => state.selectedProduction);
  const placingBuilding = useGameStore((state) => state.placingBuilding);
  const tutorialStep = useGameStore((state) => state.tutorialStep);
  const match = useGameStore((state) => state.match);
  const tutorial = TUTORIAL[tutorialStep];
  const productionProgress = selectedProduction?.currentBuildTicks
    ? Math.min(100, (selectedProduction.progressTicks / selectedProduction.currentBuildTicks) * 100)
    : 0;

  return (
    <>
      <header className="hud-topbar" style={topBar}>
        <div style={brand}>IRON DOCTRINE</div>
        <Stat label="Credits" value={`$${credits}`} accent />
        <Stat
          label="Power"
          value={`${power.produced} / ${power.consumed}`}
          warning={power.consumed > power.produced}
        />
        <div className="hud-optional" style={{ display: 'contents' }}>
          <Stat label="Assets" value={String(entityCount)} />
          <Stat label="FPS" value={String(fps)} />
        </div>
        <div style={{ flex: 1 }} />
        <button style={quietButton} onClick={onOpenEditor}>
          Map editor
        </button>
      </header>

      <section className="tutorial-card" style={tutorialCard} aria-live="polite">
        <div style={tutorialNumber}>{tutorial.number}</div>
        <div>
          <strong style={tutorialTitle}>{tutorial.title}</strong>
          <p style={tutorialText}>{tutorial.instruction}</p>
        </div>
      </section>

      <aside className="command-panel" style={commandPanel} aria-label="Command panel">
        <div style={panelHeader}>
          <div>
            <span style={kicker}>COMMAND PANEL</span>
            <strong style={panelHeading}>Build</strong>
          </div>
          <span style={hotkey}>B</span>
        </div>

        <div style={buildList}>
          {BUILDABLE_STRUCTURES.map(({ id, label, purpose }) => {
            const stats = BUILDING_STATS[id]!;
            const affordable = credits >= stats.cost;
            const active = placingBuilding === id;
            return (
              <button
                key={id}
                style={{
                  ...commandButton,
                  ...(active ? commandButtonActive : {}),
                  opacity: affordable ? 1 : 0.48,
                }}
                disabled={!affordable}
                onClick={() => onPlaceBuilding(id)}
              >
                <span style={commandIcon}>{buildingSymbol(id)}</span>
                <span style={commandCopy}>
                  <strong>{label}</strong>
                  <small>{purpose}</small>
                </span>
                <span style={commandCost}>${stats.cost}</span>
              </button>
            );
          })}
        </div>

        <div style={sectionDivider} />
        <div style={panelHeader}>
          <div>
            <span style={kicker}>SELECTED FACILITY</span>
            <strong style={panelHeading}>Production</strong>
          </div>
        </div>

        {selectedProduction ? (
          <div style={productionSection}>
            <div style={facilityName}>{humanize(selectedProduction.buildingType)}</div>
            <div style={productionGrid}>
              {selectedProduction.produces.map((unit) => {
                const stats = UNIT_STATS[unit];
                const affordable = stats !== undefined && credits >= stats.cost;
                return (
                  <button
                    key={unit}
                    style={{ ...unitButton, opacity: affordable ? 1 : 0.48 }}
                    disabled={!affordable}
                    onClick={() => onQueueProduction(unit)}
                  >
                    <strong>{humanize(unit)}</strong>
                    <span>${stats?.cost ?? '?'}</span>
                  </button>
                );
              })}
            </div>
            <div style={queueLabel}>QUEUE · {selectedProduction.queue.length || 'EMPTY'}</div>
            <div style={progressTrack}>
              <div style={{ ...progressFill, width: `${productionProgress}%` }} />
            </div>
            {selectedProduction.queue.length > 0 && (
              <div style={queueItems}>{selectedProduction.queue.map(humanize).join('  →  ')}</div>
            )}
            <button
              style={cancelButton}
              disabled={selectedProduction.queue.length === 0}
              onClick={onCancelProduction}
            >
              Cancel last item
            </button>
          </div>
        ) : (
          <div style={emptyState}>
            <strong>No production facility selected</strong>
            <span>Left-click a green barracks or war factory.</span>
          </div>
        )}
      </aside>

      {selectedEntity && (
        <section className="selection-card" style={selectionCard}>
          <span style={kicker}>SELECTION</span>
          <strong style={selectionName}>{selectedEntity.label}</strong>
          {selectedEntity.maxHp && selectedEntity.hp !== undefined && (
            <>
              <div style={selectionMeta}>
                Integrity {selectedEntity.hp} / {selectedEntity.maxHp}
              </div>
              <div style={healthTrack}>
                <div
                  style={{
                    ...healthFill,
                    width: `${(selectedEntity.hp / selectedEntity.maxHp) * 100}%`,
                  }}
                />
              </div>
            </>
          )}
          {selectedEntity.status && <div style={selectionStatus}>{selectedEntity.status}</div>}
        </section>
      )}

      {placingBuilding && (
        <div className="placement-banner" style={placementBanner}>
          <strong>PLACING {humanize(placingBuilding)}</strong>
          <span>Green = valid · Red = blocked · Left-click confirm · Right-click / Esc cancel</span>
          <button style={bannerCancel} onClick={onCancelPlacement}>
            Cancel
          </button>
        </div>
      )}

      <div className="controls-strip" style={controlsStrip}>
        <Control mouse="LMB" text="Select" />
        <Control mouse="DRAG" text="Box select" />
        <Control mouse="RMB" text="Move / attack" />
        <Control mouse="WHEEL" text="Zoom" />
        <Control mouse="WASD" text="Camera" />
      </div>

      {match?.status === 'finished' && (
        <div style={matchOverlay}>
          <div style={matchDialog}>
            <span style={kicker}>BATTLE REPORT</span>
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
            <button style={primaryButton} onClick={onRestart}>
              Restart skirmish
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  warning,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
}): JSX.Element {
  return (
    <div style={stat}>
      <span>{label}</span>
      <strong style={{ color: warning ? '#fb7185' : accent ? '#72e59a' : '#e6f2e9' }}>
        {value}
      </strong>
    </div>
  );
}

function Control({ mouse, text }: { mouse: string; text: string }): JSX.Element {
  return (
    <span style={control}>
      <kbd>{mouse}</kbd>
      {text}
    </span>
  );
}

const humanize = (value: string): string => value.replaceAll('_', ' ');
const buildingSymbol = (building: string): string =>
  ({ power_plant: 'ϟ', refinery: '◆', barracks: '▥', factory: '▣', turret: '⌖' })[building] ?? '■';
const font = "ui-monospace, 'SF Mono', Menlo, monospace";

const topBar: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 58,
  display: 'flex',
  gap: 24,
  alignItems: 'center',
  padding: '0 18px',
  background: 'rgba(6,14,11,.96)',
  borderBottom: '1px solid #294334',
  boxShadow: '0 8px 24px rgba(0,0,0,.28)',
  fontFamily: font,
  pointerEvents: 'auto',
};
const brand: React.CSSProperties = {
  color: '#dff7e7',
  fontSize: 14,
  fontWeight: 900,
  letterSpacing: '.12em',
  paddingRight: 20,
  borderRight: '1px solid #294334',
};
const stat: React.CSSProperties = {
  display: 'flex',
  minWidth: 70,
  flexDirection: 'column',
  gap: 2,
  color: '#66806f',
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: '.09em',
};
const quietButton: React.CSSProperties = {
  padding: '8px 12px',
  color: '#9bb1a2',
  background: '#101d17',
  border: '1px solid #294334',
  cursor: 'pointer',
  textTransform: 'uppercase',
  font: `700 10px ${font}`,
  letterSpacing: '.08em',
};
const tutorialCard: React.CSSProperties = {
  position: 'absolute',
  top: 76,
  left: 16,
  display: 'flex',
  gap: 14,
  width: 350,
  padding: 16,
  background: 'rgba(6,14,11,.94)',
  border: '1px solid #315441',
  borderLeft: '3px solid #64d98d',
  boxShadow: '0 12px 30px rgba(0,0,0,.3)',
  fontFamily: font,
  pointerEvents: 'none',
};
const tutorialNumber: React.CSSProperties = {
  flex: '0 0 auto',
  color: '#64d98d',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '.1em',
};
const tutorialTitle: React.CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: '#effaf2',
  fontSize: 13,
  textTransform: 'uppercase',
  letterSpacing: '.06em',
};
const tutorialText: React.CSSProperties = {
  margin: 0,
  color: '#8fa598',
  fontSize: 11,
  lineHeight: 1.5,
};
const commandPanel: React.CSSProperties = {
  position: 'absolute',
  top: 72,
  right: 14,
  width: 310,
  maxHeight: 'calc(100vh - 150px)',
  overflowY: 'auto',
  padding: 14,
  color: '#dce8df',
  background: 'rgba(6,14,11,.97)',
  border: '1px solid #315441',
  boxShadow: '0 16px 42px rgba(0,0,0,.42)',
  fontFamily: font,
  pointerEvents: 'auto',
};
const panelHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
};
const kicker: React.CSSProperties = {
  display: 'block',
  color: '#5f7968',
  font: `700 9px ${font}`,
  letterSpacing: '.14em',
};
const panelHeading: React.CSSProperties = {
  display: 'block',
  marginTop: 3,
  color: '#eef9f1',
  fontSize: 18,
  textTransform: 'uppercase',
  letterSpacing: '.04em',
};
const hotkey: React.CSSProperties = {
  display: 'grid',
  width: 24,
  height: 24,
  placeItems: 'center',
  color: '#789081',
  border: '1px solid #315441',
  fontSize: 10,
};
const buildList: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const commandButton: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '34px 1fr auto',
  gap: 10,
  alignItems: 'center',
  width: '100%',
  minHeight: 54,
  padding: '7px 10px',
  color: '#dce8df',
  textAlign: 'left',
  background: '#0e1d16',
  border: '1px solid #263d31',
  cursor: 'pointer',
};
const commandButtonActive: React.CSSProperties = {
  borderColor: '#64d98d',
  background: '#132a1e',
  boxShadow: 'inset 3px 0 #64d98d',
};
const commandIcon: React.CSSProperties = {
  display: 'grid',
  width: 32,
  height: 32,
  placeItems: 'center',
  color: '#72e59a',
  background: '#162b20',
  fontSize: 20,
};
const commandCopy: React.CSSProperties = {
  display: 'flex',
  minWidth: 0,
  flexDirection: 'column',
  gap: 3,
  textTransform: 'uppercase',
};
const commandCost: React.CSSProperties = { color: '#72e59a', fontWeight: 800, fontSize: 11 };
const sectionDivider: React.CSSProperties = { height: 1, margin: '16px 0', background: '#294334' };
const productionSection: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 9 };
const facilityName: React.CSSProperties = {
  color: '#9eb3a5',
  fontSize: 11,
  textTransform: 'uppercase',
};
const productionGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
};
const unitButton: React.CSSProperties = {
  display: 'flex',
  minHeight: 48,
  flexDirection: 'column',
  justifyContent: 'center',
  gap: 4,
  color: '#e5f1e8',
  background: '#0e1d16',
  border: '1px solid #263d31',
  cursor: 'pointer',
  textTransform: 'uppercase',
  fontSize: 10,
};
const queueLabel: React.CSSProperties = {
  marginTop: 3,
  color: '#667e6d',
  fontSize: 9,
  letterSpacing: '.1em',
};
const progressTrack: React.CSSProperties = { height: 6, overflow: 'hidden', background: '#17261f' };
const progressFill: React.CSSProperties = { height: '100%', background: '#64d98d' };
const queueItems: React.CSSProperties = {
  color: '#9db2a4',
  fontSize: 10,
  textTransform: 'uppercase',
};
const cancelButton: React.CSSProperties = {
  padding: 7,
  color: '#9aafa1',
  background: 'transparent',
  border: '1px solid #344a3d',
  cursor: 'pointer',
  textTransform: 'uppercase',
  fontSize: 9,
};
const emptyState: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 13,
  color: '#63786b',
  background: '#0b1712',
  border: '1px dashed #2b4034',
  fontSize: 10,
  lineHeight: 1.45,
};
const selectionCard: React.CSSProperties = {
  position: 'absolute',
  left: 16,
  bottom: 54,
  width: 270,
  padding: 14,
  color: '#dce8df',
  background: 'rgba(6,14,11,.94)',
  border: '1px solid #315441',
  fontFamily: font,
  pointerEvents: 'none',
};
const selectionName: React.CSSProperties = {
  display: 'block',
  margin: '5px 0 9px',
  color: '#effaf2',
  textTransform: 'uppercase',
};
const selectionMeta: React.CSSProperties = { color: '#859b8d', fontSize: 10 };
const healthTrack: React.CSSProperties = { height: 4, marginTop: 5, background: '#1b2b23' };
const healthFill: React.CSSProperties = { height: '100%', background: '#64d98d' };
const selectionStatus: React.CSSProperties = {
  marginTop: 8,
  color: '#72a787',
  fontSize: 10,
  textTransform: 'uppercase',
};
const placementBanner: React.CSSProperties = {
  position: 'absolute',
  top: 72,
  left: '50%',
  display: 'flex',
  transform: 'translateX(-50%)',
  alignItems: 'center',
  gap: 14,
  padding: '10px 14px',
  color: '#e8f6ed',
  background: '#10241a',
  border: '1px solid #64d98d',
  boxShadow: '0 10px 30px rgba(0,0,0,.4)',
  font: `10px ${font}`,
  pointerEvents: 'auto',
};
const bannerCancel: React.CSSProperties = {
  padding: '5px 9px',
  color: '#f1b5b5',
  background: '#291516',
  border: '1px solid #6e3438',
  cursor: 'pointer',
  textTransform: 'uppercase',
  fontSize: 9,
};
const controlsStrip: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 12,
  display: 'flex',
  transform: 'translateX(-50%)',
  gap: 18,
  padding: '8px 12px',
  color: '#71897a',
  background: 'rgba(6,14,11,.88)',
  border: '1px solid #243a2f',
  font: `9px ${font}`,
  pointerEvents: 'none',
};
const control: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  whiteSpace: 'nowrap',
};
const matchOverlay: React.CSSProperties = {
  position: 'absolute',
  zIndex: 50,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  background: 'rgba(3,8,6,.8)',
  pointerEvents: 'auto',
  fontFamily: font,
};
const matchDialog: React.CSSProperties = {
  display: 'flex',
  width: 390,
  flexDirection: 'column',
  gap: 18,
  padding: 36,
  textAlign: 'center',
  background: '#08110d',
  border: '1px solid #64d98d',
  boxShadow: '0 20px 70px rgba(0,0,0,.65)',
};
const matchTitle: React.CSSProperties = {
  color: '#effaf2',
  fontSize: 36,
  textTransform: 'uppercase',
  letterSpacing: '.12em',
};
const matchMessage: React.CSSProperties = { color: '#8da99a', fontSize: 12 };
const primaryButton: React.CSSProperties = {
  minHeight: 44,
  color: '#07100d',
  background: '#64d98d',
  border: 0,
  cursor: 'pointer',
  textTransform: 'uppercase',
  fontWeight: 900,
};
