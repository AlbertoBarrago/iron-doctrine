import { BUILDING_STATS, UNIT_STATS } from '@iron/engine';
import {
  useGameStore,
  type SelectedEntitySummary,
  type SelectedProduction,
  type TutorialStep,
} from '../state/gameStore.js';

const BUILDABLE_STRUCTURES = [
  { id: 'power_plant', label: 'Power plant', purpose: 'Provides 100 power' },
  { id: 'refinery', label: 'Refinery', purpose: 'Processes harvested ore' },
  { id: 'barracks', label: 'Barracks', purpose: 'Produces infantry' },
  { id: 'factory', label: 'War factory', purpose: 'Produces vehicles' },
  { id: 'turret', label: 'Defense turret', purpose: 'Automated base defense' },
] as const;

const TUTORIAL: Record<TutorialStep, { number: string; title: string; instruction: string }> = {
  select: {
    number: '01',
    title: 'Select your forces',
    instruction: 'Left-click a unit or drag a selection box.',
  },
  move: {
    number: '02',
    title: 'Issue a move order',
    instruction: 'Right-click open terrain with units selected.',
  },
  build: {
    number: '03',
    title: 'Expand the base',
    instruction: 'Choose a structure, then deploy it on clear terrain.',
  },
  produce: {
    number: '04',
    title: 'Produce a unit',
    instruction: 'Select a barracks or war factory and queue reinforcements.',
  },
  attack: {
    number: '05',
    title: 'Engage the enemy',
    instruction: 'Select combat units and right-click a red target.',
  },
  complete: {
    number: '✓',
    title: 'Commander online',
    instruction: 'Destroy the hostile construction yard. Defend your own.',
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

/** Industrial RTS command surface and progressive first-match guidance. */
export function Hud(props: HudProps): JSX.Element {
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

  return (
    <>
      <header className="hud-topbar steel-panel">
        <div className="hud-brand">
          <span className="hud-brand__mark">ID</span>
          <span>IRON DOCTRINE</span>
        </div>
        <Stat label="Credits" value={`$${credits}`} accent />
        <Stat
          label="Power"
          value={`${power.produced} / ${power.consumed}`}
          warning={power.consumed > power.produced}
        />
        <div className="hud-optional">
          <Stat label="Assets" value={String(entityCount)} />
          <Stat label="FPS" value={String(fps)} />
        </div>
        <div className="hud-spacer" />
        <div className="hud-status">
          <i /> UPLINK SECURE
        </div>
        <button className="metal-button metal-button--quiet" onClick={props.onOpenEditor}>
          Map editor
        </button>
      </header>

      <section className="tutorial-card steel-panel" aria-live="polite">
        <div className="tutorial-card__step">{tutorial.number}</div>
        <div>
          <span className="panel-kicker">FIELD TRAINING</span>
          <strong>{tutorial.title}</strong>
          <p>{tutorial.instruction}</p>
        </div>
      </section>

      <aside className="command-panel steel-panel" aria-label="Command panel">
        <div className="hazard-stripe" />
        <PanelHeading eyebrow="CONSTRUCTION YARD" title="Structures" code="BUILD" />
        <div className="build-list">
          {BUILDABLE_STRUCTURES.map(({ id, label, purpose }) => {
            const stats = BUILDING_STATS[id]!;
            const active = placingBuilding === id;
            return (
              <button
                key={id}
                className={`command-button${active ? ' command-button--active' : ''}`}
                disabled={credits < stats.cost}
                onClick={() => props.onPlaceBuilding(id)}
              >
                <span className="command-button__icon">{buildingSymbol(id)}</span>
                <span className="command-button__copy">
                  <strong>{label}</strong>
                  <small>{purpose}</small>
                </span>
                <span className="command-button__cost">${stats.cost}</span>
              </button>
            );
          })}
        </div>

        <div className="panel-separator">
          <span />
        </div>
        <PanelHeading eyebrow="SELECTED FACILITY" title="Production" code="QUEUE" />
        {selectedProduction ? (
          <ProductionPanel
            credits={credits}
            production={selectedProduction}
            onQueue={props.onQueueProduction}
            onCancel={props.onCancelProduction}
          />
        ) : (
          <div className="panel-empty">
            <span className="panel-empty__icon">!</span>
            <div>
              <strong>Facility required</strong>
              <small>Select a barracks or war factory.</small>
            </div>
          </div>
        )}
        <div className="command-panel__footer">
          <span>FIELD OPS TERMINAL</span>
          <span>v0.1</span>
        </div>
      </aside>

      {selectedEntity ? <SelectionCard entity={selectedEntity} /> : null}
      {placingBuilding ? (
        <div className="placement-banner steel-panel">
          <span className="placement-banner__lamp" />
          <div>
            <strong>DEPLOYING {humanize(placingBuilding)}</strong>
            <small>Left-click confirm · Right-click / Esc abort</small>
          </div>
          <button className="metal-button metal-button--danger" onClick={props.onCancelPlacement}>
            Abort
          </button>
        </div>
      ) : null}

      <div className="controls-strip steel-panel">
        <Control keyName="LMB" text="Select" />
        <Control keyName="DRAG" text="Box select" />
        <Control keyName="RMB" text="Move / attack" />
        <Control keyName="WHEEL" text="Zoom" />
        <Control keyName="WASD" text="Camera" />
      </div>

      {match?.status === 'finished' ? (
        <div className="match-overlay">
          <div className="match-dialog steel-panel">
            <div className="hazard-stripe" />
            <span className="panel-kicker">BATTLE REPORT</span>
            <strong className="match-dialog__title">
              {match.winner === 0 ? 'Victory' : match.winner === null ? 'Draw' : 'Defeat'}
            </strong>
            <p>
              {match.winner === 0
                ? 'Enemy command has been eliminated.'
                : match.winner === null
                  ? 'Both command structures were destroyed.'
                  : 'Your command structure has been destroyed.'}
            </p>
            <button className="metal-button metal-button--primary" onClick={props.onRestart}>
              Restart skirmish
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function PanelHeading({
  eyebrow,
  title,
  code,
}: {
  eyebrow: string;
  title: string;
  code: string;
}): JSX.Element {
  return (
    <div className="panel-heading">
      <div>
        <span className="panel-kicker">{eyebrow}</span>
        <strong>{title}</strong>
      </div>
      <span className="panel-code">{code}</span>
    </div>
  );
}

function ProductionPanel({
  credits,
  production,
  onQueue,
  onCancel,
}: {
  credits: number;
  production: SelectedProduction;
  onQueue(unit: string): void;
  onCancel(): void;
}): JSX.Element {
  const progress = production.currentBuildTicks
    ? Math.min(100, (production.progressTicks / production.currentBuildTicks) * 100)
    : 0;
  return (
    <div className="production-section">
      <div className="facility-name">
        <span className="status-lamp" />
        {humanize(production.buildingType)}
      </div>
      <div className="production-grid">
        {production.produces.map((unit) => {
          const stats = UNIT_STATS[unit];
          return (
            <button
              key={unit}
              className="unit-button"
              disabled={!stats || credits < stats.cost}
              onClick={() => onQueue(unit)}
            >
              <span className="unit-button__icon">{unitSymbol(unit)}</span>
              <strong>{humanize(unit)}</strong>
              <small>${stats?.cost ?? '?'}</small>
            </button>
          );
        })}
      </div>
      <div className="queue-label">
        <span>BUILD QUEUE</span>
        <b>{production.queue.length || 'EMPTY'}</b>
      </div>
      <div className="meter">
        <div style={{ width: `${progress}%` }} />
      </div>
      {production.queue.length ? (
        <div className="queue-items">{production.queue.map(humanize).join('  ›  ')}</div>
      ) : null}
      <button
        className="metal-button metal-button--wide"
        disabled={!production.queue.length}
        onClick={onCancel}
      >
        Cancel last item
      </button>
    </div>
  );
}

function SelectionCard({ entity }: { entity: SelectedEntitySummary }): JSX.Element {
  const health = entity.maxHp && entity.hp !== undefined ? (entity.hp / entity.maxHp) * 100 : null;
  return (
    <section className="selection-card steel-panel">
      <span className="panel-kicker">TACTICAL READOUT</span>
      <strong>{entity.label}</strong>
      {health !== null ? (
        <>
          <div className="selection-card__meta">
            <span>ARMOR</span>
            <span>
              {entity.hp} / {entity.maxHp}
            </span>
          </div>
          <div className="meter meter--health">
            <div style={{ width: `${health}%` }} />
          </div>
        </>
      ) : null}
      {entity.status ? (
        <div className="selection-card__status">
          <i />
          {entity.status}
        </div>
      ) : null}
    </section>
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
    <div className="hud-stat">
      <span>{label}</span>
      <strong className={warning ? 'is-warning' : accent ? 'is-accent' : ''}>{value}</strong>
    </div>
  );
}

function Control({ keyName, text }: { keyName: string; text: string }): JSX.Element {
  return (
    <span className="control">
      <kbd>{keyName}</kbd>
      {text}
    </span>
  );
}

const humanize = (value: string): string => value.replaceAll('_', ' ');
const buildingSymbol = (building: string): string =>
  ({ power_plant: 'ϟ', refinery: '◆', barracks: '▥', factory: '▣', turret: '⌖' })[building] ?? '■';
const unitSymbol = (unit: string): string =>
  ({ rifleman: '▲', engineer: '◇', tank: '▰', harvester: '⬢' })[unit] ?? '●';
