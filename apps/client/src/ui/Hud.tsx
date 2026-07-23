import { useState } from 'react';
import { BUILDING_STATS, UNIT_STATS } from '@iron/engine';
import {
  commandAvailability,
  useGameStore,
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
  onQueueProduction(unit: string): void;
  onCancelProduction(): void;
  onPlaceBuilding(building: string): void;
  onCancelPlacement(): void;
  onGather(): void;
  onStop(): void;
  onRestart(): void;
}

/** Industrial RTS command surface and progressive first-match guidance. */
export function Hud(props: HudProps): JSX.Element {
  const [statsOpen, setStatsOpen] = useState(false);
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
            className="command-panel__menu"
            aria-label="Toggle commander statistics"
            aria-expanded={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            ☰
          </button>
        </header>

        {statsOpen ? (
          <section className="commander-stats">
            <span>COMMANDER STATUS</span>
            <dl>
              <div><dt>Field assets</dt><dd>{entityCount}</dd></div>
              <div><dt>Render link</dt><dd>{fps} FPS</dd></div>
              <div>
                <dt>Hostile mobilization</dt>
                <dd>{aiActivationSeconds > 0 ? `${aiActivationSeconds}s` : 'ACTIVE'}</dd>
              </div>
              <div><dt>Command uplink</dt><dd>{baseOperational ? 'ONLINE' : 'OFFLINE'}</dd></div>
            </dl>
          </section>
        ) : null}

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
          <span>{tutorial.number}</span>
          <div>
            <small>FIELD DIRECTIVE</small>
            <strong>{tutorial.title}</strong>
            <p>{tutorial.instruction}</p>
          </div>
        </section>

        {selectedEntity ? (
          <SelectionCard entity={selectedEntity} onGather={props.onGather} onStop={props.onStop} />
        ) : (
          <div className="panel-empty panel-empty--selection">
            <span className="panel-empty__icon">⌖</span>
            <div>
              <strong>Patrol ready</strong>
              <small>Select units on the battlefield.</small>
            </div>
          </div>
        )}

        <div className="panel-separator"><span /></div>

        {baseOperational ? (
          <>
            <PanelHeading eyebrow="CONSTRUCTION YARD" title="Structures" code="BUILD" />
            <div className="build-list">
              {BUILDABLE_STRUCTURES.map(({ id, label, purpose, unlocks }) => {
                const stats = BUILDING_STATS[id]!;
                const active = placingBuilding === id;
                const availability = commandAvailability(credits, stats.cost);
                return (
                  <button
                    key={id}
                    className={`command-button${active ? ' command-button--active' : ''}`}
                    disabled={!availability.available}
                    onClick={() => props.onPlaceBuilding(id)}
                    title={availability.label}
                  >
                    <span className="command-button__icon">{buildingSymbol(id)}</span>
                    <span className="command-button__copy">
                      <strong>{label}</strong>
                      <small>{purpose}</small>
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

            <div className="panel-separator"><span /></div>
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
          </>
        ) : (
          <section className="command-lock">
            <div className="command-lock__emblem">ID</div>
            <span>COMMAND UPLINK OFFLINE</span>
            <strong>
              {scenario?.phase === 'recovering' ? 'Base recovery in progress' : 'Find the base'}
            </strong>
            <small>Construction, production and radar will activate after recovery.</small>
          </section>
        )}

        <div className="command-panel__footer">
          <span>
            {aiActivationSeconds > 0 ? `HOSTILE MOBILIZATION ${aiActivationSeconds}s` : 'CONTACT'}
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
        <Control keyName="EDGE" text="Pan camera" />
        <Control keyName="MMB" text="Drag camera" />
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
          const availability = stats
            ? commandAvailability(credits, stats.cost)
            : { available: false as const, label: 'Unavailable' };
          return (
            <button
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

function SelectionCard({
  entity,
  onGather,
  onStop,
}: {
  entity: SelectedEntitySummary;
  onGather: () => void;
  onStop: () => void;
}): JSX.Element {
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
      <div className="selection-card__orders">
        <span className="panel-kicker">AVAILABLE ORDERS</span>
        {entity.commands.map((command) => {
          const help = COMMAND_HELP[command];
          const action = command === 'gather' ? onGather : command === 'stop' ? onStop : null;
          return action ? (
            <button key={command} onClick={action}>
              <strong>{help.label}</strong>
              <small>{help.instruction}</small>
            </button>
          ) : (
            <div key={command} className="selection-card__order">
              <strong>{help.label}</strong>
              <small>{help.instruction}</small>
            </div>
          );
        })}
      </div>
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
