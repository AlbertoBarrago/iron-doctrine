import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BUILDING_STATS, UNIT_STATS } from '@iron/engine';
import {
  commandAvailability,
  preferredCommandTab,
  useGameStore,
  type CommandTab,
  type SelectedEntitySummary,
  type SelectedProduction,
  type SelectionCommand,
  type TutorialStep,
} from '../state/gameStore.js';

const BUILDABLE_STRUCTURES = [
  {
    id: 'power_plant',
    label: 'Power plant',
    purpose: 'Keeps powered defenses operational',
    unlocks: '+100 power',
  },
  {
    id: 'refinery',
    label: 'Refinery',
    purpose: 'Accepts ore deliveries from harvesters',
    unlocks: 'Unlocks income',
  },
  {
    id: 'barracks',
    label: 'Barracks',
    purpose: 'Trains inexpensive ground forces',
    unlocks: 'Riflemen · Engineers',
  },
  {
    id: 'factory',
    label: 'War factory',
    purpose: 'Builds armored and economy vehicles',
    unlocks: 'Tanks · Harvesters',
  },
  {
    id: 'turret',
    label: 'Defense turret',
    purpose: 'Automatically engages nearby hostiles',
    unlocks: 'Requires 40 power',
  },
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
  gather: {
    number: '03',
    title: 'Fund the war effort',
    instruction: 'Select the harvester and right-click an ore field.',
  },
  build: {
    number: '04',
    title: 'Expand the base',
    instruction: 'Choose a structure, then deploy it on clear terrain.',
  },
  produce: {
    number: '05',
    title: 'Produce a unit',
    instruction: 'Select a barracks or war factory and queue reinforcements.',
  },
  attack: {
    number: '06',
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
  minimap: ReactNode;
  setupOpen: boolean;
  paused: boolean;
  audioMuted: boolean;
  audioVolume: number;
  onSetupChange(open: boolean): void;
  onPausedChange(paused: boolean): void;
  onAudioMutedChange(muted: boolean): void;
  onAudioVolumeChange(volume: number): void;
  onQueueProduction(unit: string): void;
  onCancelProduction(): void;
  onPlaceBuilding(building: string): void;
  onCancelPlacement(): void;
  onGather(): void;
  onStop(): void;
  onRestart(): void;
  onExit(): void;
}

/** Industrial RTS command surface and progressive first-match guidance. */
export function Hud(props: HudProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<CommandTab>('orders');
  const fps = useGameStore((state) => state.fps);
  const entityCount = useGameStore((state) => state.entityCount);
  const credits = useGameStore((state) => state.credits);
  const power = useGameStore((state) => state.power);
  const selectedEntity = useGameStore((state) => state.selectedEntity);
  const selectedProduction = useGameStore((state) => state.selectedProduction);
  const placingBuilding = useGameStore((state) => state.placingBuilding);
  const tutorialStep = useGameStore((state) => state.tutorialStep);
  const match = useGameStore((state) => state.match);
  const scenario = useGameStore((state) => state.scenario);
  const aiActivationSeconds = useGameStore((state) => state.aiActivationSeconds);
  const tutorial = TUTORIAL[tutorialStep];
  const baseOperational = scenario?.phase === 'operational';
  useEffect(() => {
    if (!props.setupOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onSetupChange(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [props.setupOpen, props.onSetupChange]);
  useEffect(() => {
    setActiveTab(preferredCommandTab(selectedEntity, selectedProduction));
  }, [selectedEntity, selectedProduction]);

  return (
    <>
      <section className="mission-notice" aria-live="polite">
        <span className="mission-notice__signal" />
        <div>
          <span>PRIMARY OBJECTIVE</span>
          <strong>{scenario?.objective ?? 'Establishing tactical link'}</strong>
          {scenario?.phase === 'recovering' ? (
            <div className="mission-notice__progress">
              <i style={{ width: `${scenario.progress * 100}%` }} />
            </div>
          ) : null}
        </div>
      </section>

      <aside
        className={`command-panel steel-panel${baseOperational ? ' is-operational' : ''}`}
        aria-label="Command panel"
      >
        <header className="command-panel__masthead">
          <div className="hud-brand">
            <span className="hud-brand__mark">ID</span>
            <span>IRON DOCTRINE</span>
          </div>
          <button
            type="button"
            className="command-panel__menu"
            aria-label="Open game setup"
            aria-expanded={props.setupOpen}
            onClick={() => props.onSetupChange(true)}
          >
            SETUP
          </button>
        </header>

        <div className="command-panel__resources">
          <Stat label="Credits" value={`$${credits}`} accent />
          <Stat
            label="Power"
            value={`${power.produced}/${power.consumed}`}
            warning={power.consumed > power.produced}
          />
          <Stat label="Force" value={String(entityCount)} />
        </div>

        <section className="field-directive">
          <span>!</span>
          <div>
            <small>PRIMARY MISSION</small>
            <strong>{scenario?.objective ?? tutorial.title}</strong>
            <p>{tutorial.instruction}</p>
          </div>
        </section>

        {selectedEntity ? (
          <SelectionCard entity={selectedEntity} />
        ) : (
          <div className="panel-empty panel-empty--selection">
            <span className="panel-empty__icon">⌖</span>
            <div>
              <strong>Patrol ready</strong>
              <small>Select units on the battlefield.</small>
            </div>
          </div>
        )}

        <section className="command-workspace">
          <div className="command-tabs" role="tablist" aria-label="Command sections">
            {(['orders', 'build', 'production'] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? 'is-active' : ''}
                disabled={tab !== 'orders' && !baseOperational}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="command-workspace__pane">
            {activeTab === 'orders' ? (
              selectedEntity ? (
                <OrdersPanel
                  entity={selectedEntity}
                  onGather={props.onGather}
                  onStop={props.onStop}
                />
              ) : (
                <WorkspaceEmpty title="No selection" copy="Select a unit or structure." />
              )
            ) : activeTab === 'build' ? (
              <div className="build-list">
                {BUILDABLE_STRUCTURES.map(({ id, label, purpose, unlocks }) => {
                  const stats = BUILDING_STATS[id]!;
                  const active = placingBuilding === id;
                  const availability = commandAvailability(credits, stats.cost);
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`command-button${active ? ' command-button--active' : ''}`}
                      disabled={!availability.available}
                      onClick={() => props.onPlaceBuilding(id)}
                      title={`${purpose}. ${unlocks}. ${availability.label}.`}
                    >
                      <span className="command-button__icon">{buildingSymbol(id)}</span>
                      <span className="command-button__copy">
                        <strong>{label}</strong>
                        <small className="command-button__unlocks">{unlocks}</small>
                      </span>
                      <span className="command-button__meta">
                        <span className="command-button__cost">${stats.cost}</span>
                        <small className={availability.available ? 'is-ready' : 'is-blocked'}>
                          {availability.label}
                        </small>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : selectedProduction ? (
              <ProductionPanel
                credits={credits}
                production={selectedProduction}
                onQueue={props.onQueueProduction}
                onCancel={props.onCancelProduction}
              />
            ) : (
              <WorkspaceEmpty title="Facility required" copy="Select a barracks or war factory." />
            )}
          </div>
        </section>

        {baseOperational ? props.minimap : null}

        <div className="command-panel__footer">
          <span>
            {!baseOperational
              ? 'HOSTILE FORCES HOLDING'
              : aiActivationSeconds > 0
                ? `HOSTILE MOBILIZATION ${aiActivationSeconds}s`
                : 'CONTACT'}
          </span>
          <span>{fps} FPS</span>
        </div>
      </aside>

      {placingBuilding ? (
        <div className="placement-banner steel-panel">
          <span className="placement-banner__lamp" />
          <div>
            <strong>DEPLOYING {humanize(placingBuilding)}</strong>
            <small>Left-click confirm · Right-click / Esc abort</small>
          </div>
          <button
            type="button"
            className="metal-button metal-button--danger"
            onClick={props.onCancelPlacement}
          >
            Abort
          </button>
        </div>
      ) : null}

      {props.setupOpen ? (
        <SetupOverlay
          audioMuted={props.audioMuted}
          audioVolume={props.audioVolume}
          assets={entityCount}
          fps={fps}
          baseOperational={baseOperational}
          aiActivationSeconds={aiActivationSeconds}
          objective={scenario?.objective ?? 'Establishing tactical link'}
          onClose={() => props.onSetupChange(false)}
          onMutedChange={props.onAudioMutedChange}
          onVolumeChange={props.onAudioVolumeChange}
        />
      ) : null}

      {props.paused && !props.setupOpen && match?.status !== 'finished' ? (
        <div
          className="pause-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-title"
        >
          <div className="pause-dialog steel-panel">
            <span className="panel-kicker">SIMULATION HALTED</span>
            <strong id="pause-title">Paused</strong>
            <span>
              Press <kbd>P</kbd> to resume
            </span>
            <button
              type="button"
              className="metal-button metal-button--primary"
              onClick={() => props.onPausedChange(false)}
            >
              Resume battle
            </button>
          </div>
        </div>
      ) : null}

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
            <div className="match-dialog__actions">
              <button
                type="button"
                className="metal-button metal-button--primary"
                onClick={props.onRestart}
              >
                Restart skirmish
              </button>
              <button type="button" className="metal-button" onClick={props.onExit}>
                Return to main menu
              </button>
            </div>
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
          const availability = stats
            ? commandAvailability(credits, stats.cost)
            : { available: false as const, label: 'Unavailable' };
          return (
            <button
              type="button"
              key={unit}
              className="unit-button"
              disabled={!availability.available}
              onClick={() => onQueue(unit)}
              title={availability.label}
            >
              <span className="unit-button__icon">{unitSymbol(unit)}</span>
              <strong>{humanize(unit)}</strong>
              <small>
                ${stats?.cost ?? '?'} · {availability.label}
              </small>
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
        type="button"
        className="metal-button metal-button--wide"
        disabled={!production.queue.length}
        onClick={onCancel}
      >
        Cancel last item
      </button>
    </div>
  );
}

const COMMAND_HELP: Record<SelectionCommand, { label: string; instruction: string }> = {
  gather: { label: 'Harvest ore', instruction: 'Right-click an ore field or use nearest' },
  move: { label: 'Move', instruction: 'Right-click open terrain' },
  attack: { label: 'Attack', instruction: 'Right-click a red target' },
  stop: { label: 'Stop', instruction: 'Cancel the current order' },
  build: { label: 'Build', instruction: 'Choose a structure in the right panel' },
  produce: { label: 'Produce', instruction: 'Queue a unit in the right panel' },
  rally: { label: 'Rally point', instruction: 'Right-click terrain to set it' },
};

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
      {entity.cargo ? (
        <>
          <div className="selection-card__meta selection-card__meta--cargo">
            <span>ORE CARGO</span>
            <span>
              {entity.cargo.amount} / {entity.cargo.capacity}
            </span>
          </div>
          <div
            className="meter meter--cargo"
            style={
              {
                '--cargo-fill': `${(entity.cargo.amount / entity.cargo.capacity) * 100}%`,
              } as CSSProperties
            }
          />
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

function OrdersPanel({
  entity,
  onGather,
  onStop,
}: {
  entity: SelectedEntitySummary;
  onGather(): void;
  onStop(): void;
}): JSX.Element {
  return (
    <div className="quick-orders">
      {entity.commands.map((command) => {
        const help = COMMAND_HELP[command];
        const action = command === 'gather' ? onGather : command === 'stop' ? onStop : null;
        return action ? (
          <button type="button" key={command} onClick={action}>
            <strong>{help.label}</strong>
            <small>{help.instruction}</small>
          </button>
        ) : (
          <div key={command}>
            <strong>{help.label}</strong>
            <small>{help.instruction}</small>
          </div>
        );
      })}
    </div>
  );
}

function WorkspaceEmpty({ title, copy }: { title: string; copy: string }): JSX.Element {
  return (
    <div className="workspace-empty">
      <span>!</span>
      <strong>{title}</strong>
      <small>{copy}</small>
    </div>
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

function SetupOverlay({
  audioMuted,
  audioVolume,
  assets,
  fps,
  baseOperational,
  aiActivationSeconds,
  objective,
  onClose,
  onMutedChange,
  onVolumeChange,
}: {
  audioMuted: boolean;
  audioVolume: number;
  assets: number;
  fps: number;
  baseOperational: boolean;
  aiActivationSeconds: number;
  objective: string;
  onClose(): void;
  onMutedChange(muted: boolean): void;
  onVolumeChange(volume: number): void;
}): JSX.Element {
  const controls = [
    ['LMB', 'Select unit'],
    ['LMB drag', 'Select squad'],
    ['RMB', 'Move or attack'],
    ['RMB drag', 'Pan camera'],
    ['MMB drag', 'Pan camera'],
    ['Double LMB', 'Center camera'],
    ['Wheel', 'Zoom'],
    ['WASD / edges', 'Pan camera'],
    ['P', 'Pause or resume'],
    ['Q', 'Quit to main menu'],
  ];
  return (
    <div
      className="setup-overlay"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="setup-dialog steel-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <header className="setup-dialog__header">
          <div>
            <span className="panel-kicker">SIMULATION PAUSED</span>
            <h2 id="setup-title">Field setup</h2>
          </div>
          <button type="button" className="metal-button" onClick={onClose}>
            Return to battle
          </button>
        </header>
        <div className="setup-grid">
          <section className="setup-section">
            <PanelHeading eyebrow="INPUT REFERENCE" title="Controls" code="CTRL" />
            <div className="setup-controls">
              {controls.map(([key, action]) => (
                <div key={key}>
                  <kbd>{key}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="setup-section">
            <PanelHeading eyebrow="SIGNAL MIXER" title="Audio" code="SFX" />
            <label className="setup-toggle">
              <input
                type="checkbox"
                checked={!audioMuted}
                onChange={(event) => onMutedChange(!event.target.checked)}
              />
              <span>Sound effects enabled</span>
            </label>
            <label className="setup-volume">
              <span>Effects volume</span>
              <strong>{Math.round(audioVolume * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={audioVolume}
                disabled={audioMuted}
                onChange={(event) => onVolumeChange(Number(event.target.value))}
              />
            </label>
          </section>
          <section className="setup-section">
            <PanelHeading eyebrow="OPERATION STATUS" title="Mission" code="INFO" />
            <dl className="setup-mission">
              <div>
                <dt>Objective</dt>
                <dd>{objective}</dd>
              </div>
              <div>
                <dt>Field assets</dt>
                <dd>{assets}</dd>
              </div>
              <div>
                <dt>Command uplink</dt>
                <dd>{baseOperational ? 'ONLINE' : 'OFFLINE'}</dd>
              </div>
              <div>
                <dt>Hostile forces</dt>
                <dd>
                  {!baseOperational
                    ? 'HOLDING'
                    : aiActivationSeconds > 0
                      ? `${aiActivationSeconds}s`
                      : 'ACTIVE'}
                </dd>
              </div>
              <div>
                <dt>Render link</dt>
                <dd>{fps} FPS</dd>
              </div>
            </dl>
          </section>
        </div>
        <footer>ESC closes setup · simulation resumes on return</footer>
      </section>
    </div>
  );
}

const humanize = (value: string): string => value.replaceAll('_', ' ');
const buildingSymbol = (building: string): string =>
  ({ power_plant: 'ϟ', refinery: '◆', barracks: '▥', factory: '▣', turret: '⌖' })[building] ?? '■';
const unitSymbol = (unit: string): string =>
  ({ rifleman: '▲', engineer: '◇', tank: '▰', harvester: '⬢' })[unit] ?? '●';
