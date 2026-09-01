import { useEffect, useState } from 'react';
import { BUILDING_STATS, UNIT_STATS } from '@iron/engine';
import { SIM_HZ } from '@iron/shared';
import {
  commandAvailability,
  commandSelectionContext,
  commandTabAvailable,
  preferredCommandTab,
  useGameStore,
  type CommandTab,
  type ControlGroupSummary,
  type ForceSummary,
  type SelectedEntitySummary,
  type SelectedProduction,
  type SelectionCommand,
  type TutorialStep,
  type BattleReport,
} from '../state/gameStore.js';
import { BUILDING_PROFILES, UNIT_PROFILES, usesContinuousPlacement } from '../game/gameContent.js';
import { matchResultActions, type MatchResultAction } from '../game/matchResult.js';
import type { MissionId } from '../game/skirmishConfig.js';
import { ACHIEVEMENTS, type AchievementId } from '../game/achievements.js';
import { analyzeBattle } from '../game/battleAnalysis.js';
import { UI_ASSET_PREVIEW_URLS, type UiAssetPreviewId } from '../assets/assets.gen.js';

const BUILDABLE_STRUCTURES = [
  {
    id: 'concrete_wall',
    unlocks: 'Continuous placement',
  },
  {
    id: 'power_plant',
    unlocks: '+100 power',
  },
  {
    id: 'barracks',
    unlocks: 'Riflemen · Engineers · Medics',
  },
  {
    id: 'factory',
    unlocks: 'Tanks · Harvesters',
  },
  {
    id: 'turret',
    unlocks: 'Requires 40 power',
  },
] as const;

const TUTORIAL: Record<TutorialStep, { number: string; title: string; instruction: string }> = {
  select: {
    number: '01',
    title: 'Select the construction yard',
    instruction: 'Left-click your command structure to open base construction.',
  },
  power: {
    number: '02',
    title: 'Establish the power grid',
    instruction: 'Build a Power Plant beside the construction yard.',
  },
  gather: {
    number: '03',
    title: 'Fund the war effort',
    instruction: 'Select the harvester and right-click an ore field.',
  },
  barracks: {
    number: '04',
    title: 'Establish a barracks',
    instruction: 'Build infantry production inside your base perimeter.',
  },
  produce: {
    number: '05',
    title: 'Train the first squad',
    instruction: 'Select the barracks and queue a Rifleman.',
  },
  defense: {
    number: '06',
    title: 'Secure the perimeter',
    instruction: 'Build concrete walls or a defense turret around the base.',
  },
  complete: {
    number: '✓',
    title: 'Base operational',
    instruction: 'Continue expanding at your own pace. No attack is inbound.',
  },
};

interface HudProps {
  mission: MissionId;
  setupOpen: boolean;
  paused: boolean;
  audioMuted: boolean;
  audioVolume: number;
  musicMuted: boolean;
  musicVolume: number;
  onSetupChange(open: boolean): void;
  onPausedChange(paused: boolean): void;
  onAudioMutedChange(muted: boolean): void;
  onAudioVolumeChange(volume: number): void;
  onMusicMutedChange(muted: boolean): void;
  onMusicVolumeChange(volume: number): void;
  onQueueProduction(unit: string): void;
  onCancelProduction(): void;
  onPlaceBuilding(building: string): void;
  onCancelPlacement(): void;
  onGather(): void;
  onStop(): void;
  onSwitchWeapon(index: number): void;
  onRecallControlGroup(slot: number): void;
  onRemoveBuilding(recycle: boolean): void;
  onRestart(): void;
  onExit(): void;
}

/** Industrial RTS command surface and progressive first-match guidance. */
export function Hud(props: HudProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<CommandTab>('orders');
  const [pendingRemoval, setPendingRemoval] = useState<'demolish' | 'recycle' | null>(null);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const fps = useGameStore((state) => state.fps);
  const entityCount = useGameStore((state) => state.entityCount);
  const forceSummary = useGameStore((state) => state.forceSummary);
  const controlGroups = useGameStore((state) => state.controlGroups);
  const credits = useGameStore((state) => state.credits);
  const power = useGameStore((state) => state.power);
  const selectedEntity = useGameStore((state) => state.selectedEntity);
  const selectedProduction = useGameStore((state) => state.selectedProduction);
  const placingBuilding = useGameStore((state) => state.placingBuilding);
  const tutorialStep = useGameStore((state) => state.tutorialStep);
  const match = useGameStore((state) => state.match);
  const battleReport = useGameStore((state) => state.battleReport);
  const scenario = useGameStore((state) => state.scenario);
  const aiActivationSeconds = useGameStore((state) => state.aiActivationSeconds);
  const desyncTick = useGameStore((state) => state.desyncTick);
  const tutorial = TUTORIAL[tutorialStep];
  const resultActions =
    match?.status === 'finished' ? matchResultActions(props.mission, match.winner) : null;
  const runResultAction = (action: MatchResultAction): void => {
    if (action === 'restart') props.onRestart();
    else props.onExit();
  };
  const baseOperational = props.mission !== 'first_contact' || scenario?.phase === 'operational';
  const canBuild = commandTabAvailable(
    'build',
    baseOperational,
    selectedEntity,
    selectedProduction,
  );
  const preferredTab = preferredCommandTab(selectedEntity, selectedProduction);
  const tabResetKey = commandSelectionContext(selectedEntity, selectedProduction);
  useEffect(() => {
    if (!props.setupOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onSetupChange(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [props.setupOpen, props.onSetupChange]);
  useEffect(() => {
    void tabResetKey;
    setActiveTab(preferredTab);
  }, [tabResetKey, preferredTab]);

  return (
    <>
      {desyncTick !== null && (
        <section
          role="alert"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            padding: '8px 16px',
            background: '#a93427',
            color: '#fff',
            fontWeight: 600,
            textAlign: 'center',
          }}
        >
          ⚠ Desync detected at tick {desyncTick} — the two games have diverged, results from
          here on aren't reliable.
        </section>
      )}
      <section className="mission-notice" aria-live="polite">
        <span className="mission-notice__signal" />
        <div>
          <span>PRIMARY OBJECTIVE</span>
          <strong>{scenario?.objective ?? tutorial.title}</strong>
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
          <Stat
            label="Force"
            value={`${forceSummary.selected}/${forceSummary.total}`}
            accent={forceSummary.selected > 0}
          />
        </div>

        <ForceRoster
          force={forceSummary}
          groups={controlGroups}
          onRecallGroup={props.onRecallControlGroup}
        />

        {props.mission === 'base_foundations' ? <TutorialChecklist current={tutorialStep} /> : null}

        <section className="command-workspace">
          <div className="command-tabs" role="tablist" aria-label="Command sections">
            {(['orders', 'build', 'production'] as const).map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? 'is-active' : ''}
                disabled={
                  !commandTabAvailable(tab, baseOperational, selectedEntity, selectedProduction)
                }
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
                  onSwitchWeapon={props.onSwitchWeapon}
                  onRemove={(action) => setPendingRemoval(action)}
                />
              ) : (
                <WorkspaceEmpty title="No selection" copy="Select a unit or structure." />
              )
            ) : activeTab === 'build' && canBuild ? (
              <div className="build-list">
                {BUILDABLE_STRUCTURES.map(({ id, unlocks }) => {
                  const stats = BUILDING_STATS[id]!;
                  const profile = BUILDING_PROFILES[id]!;
                  const active = placingBuilding === id;
                  const availability = commandAvailability(credits, stats.cost);
                  return (
                    <button
                      type="button"
                      key={id}
                      className={`command-button${active ? ' command-button--active' : ''}${
                        isTutorialBuildObjective(tutorialStep, id)
                          ? ' command-button--objective'
                          : ''
                      }`}
                      disabled={!availability.available}
                      onClick={() => props.onPlaceBuilding(id)}
                      title={`${profile.description} ${profile.tacticalNote} ${availability.label}.`}
                    >
                      <AssetPreview
                        className="command-button__icon"
                        id={`building.${id}`}
                        label={profile.label}
                      />
                      <span className="command-button__copy">
                        <strong>{profile.label}</strong>
                        <small>{profile.description}</small>
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
              <WorkspaceEmpty
                title={activeTab === 'build' ? 'Construction yard required' : 'Facility required'}
                copy={
                  activeTab === 'build'
                    ? 'Select your construction yard to deploy structures.'
                    : 'Select a barracks or war factory.'
                }
              />
            )}
          </div>
        </section>

        <div className="command-panel__footer">
          <span>
            {props.mission === 'base_foundations'
              ? tutorialStep === 'complete'
                ? 'TRAINING COMPLETE'
                : 'TRAINING AREA SECURE'
              : !baseOperational
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
            <small>
              {usesContinuousPlacement(placingBuilding)
                ? 'Left-click place next segment · Right-click / Esc finish'
                : 'Left-click confirm · Right-click / Esc abort'}
            </small>
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
          musicMuted={props.musicMuted}
          musicVolume={props.musicVolume}
          assets={entityCount}
          fps={fps}
          baseOperational={baseOperational}
          aiActivationSeconds={aiActivationSeconds}
          objective={scenario?.objective ?? 'Establishing tactical link'}
          onClose={() => props.onSetupChange(false)}
          onMutedChange={props.onAudioMutedChange}
          onVolumeChange={props.onAudioVolumeChange}
          onMusicMutedChange={props.onMusicMutedChange}
          onMusicVolumeChange={props.onMusicVolumeChange}
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

      {pendingRemoval ? (
        <ConfirmationDialog
          title={pendingRemoval === 'recycle' ? 'Recycle structure?' : 'Demolish structure?'}
          copy={
            pendingRemoval === 'recycle'
              ? 'The selected engineer will recover one third of its construction cost.'
              : 'The structure will be destroyed permanently. No credits will be recovered.'
          }
          confirmLabel={pendingRemoval === 'recycle' ? 'Recycle structure' : 'Demolish structure'}
          onConfirm={() => {
            props.onRemoveBuilding(pendingRemoval === 'recycle');
            setPendingRemoval(null);
          }}
          onCancel={() => setPendingRemoval(null)}
        />
      ) : null}

      {props.mission === 'base_foundations' &&
      tutorialStep === 'complete' &&
      !completionDismissed ? (
        <div className="match-overlay">
          <div className="match-dialog steel-panel">
            <div className="hazard-stripe" />
            <span className="panel-kicker">FIELD COMMAND CONFIRMED</span>
            <strong className="match-dialog__title">Operation complete</strong>
            <p>Your base is operational and the next campaign operation is now available.</p>
            {battleReport ? <BattleStatistics report={battleReport} /> : null}
            <div className="match-dialog__actions">
              <button
                type="button"
                className="metal-button metal-button--primary"
                onClick={props.onExit}
              >
                Continue campaign
              </button>
              <button
                type="button"
                className="metal-button"
                onClick={() => setCompletionDismissed(true)}
              >
                Remain in training area
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {match?.status === 'finished' && resultActions ? (
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
            {battleReport ? <BattleStatistics report={battleReport} /> : null}
            <div className="match-dialog__actions">
              <button
                type="button"
                className="metal-button metal-button--primary"
                onClick={() => runResultAction(resultActions.primary)}
              >
                {resultActions.primaryLabel}
              </button>
              <button
                type="button"
                className="metal-button"
                onClick={() => runResultAction(resultActions.secondary)}
              >
                {resultActions.secondaryLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BattleStatistics({ report }: { report: BattleReport }): JSX.Element {
  const { metrics } = report;
  const seconds = Math.floor(metrics.durationTicks / SIM_HZ);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  const destroyed = Object.entries(metrics.destroyedByType).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  const analysis = analyzeBattle(metrics, report.victory);
  return (
    <section className="battle-statistics" aria-label="Detailed battle statistics">
      <div className="battle-statistics__grid">
        <Stat label="Duration" value={duration} />
        <Stat label="Units destroyed" value={String(metrics.unitsDestroyed)} />
        <Stat label="Structures" value={String(metrics.structuresDestroyed)} />
        <Stat label="Units lost" value={String(metrics.unitsLost)} warning={metrics.unitsLost > 0} />
        <Stat label="Damage dealt" value={String(metrics.damageDealt)} />
        <Stat label="Damage taken" value={String(metrics.damageTaken)} />
        <Stat label="Ore delivered" value={String(metrics.oreDelivered)} accent />
        <Stat label="Map explored" value={`${Math.round(metrics.exploredPercent)}%`} />
      </div>
      {destroyed.length > 0 ? (
        <div className="battle-statistics__kills">
          <span>ELIMINATION BREAKDOWN</span>
          <p>
            {destroyed
              .map(
                ([type, count]) =>
                  `${UNIT_PROFILES[type]?.label ?? BUILDING_PROFILES[type]?.label ?? humanize(type)} ×${count}`,
              )
              .join(' · ')}
          </p>
        </div>
      ) : null}
      {analysis.length > 0 ? (
        <div className="battle-statistics__analysis">
          <span>TACTICAL ANALYSIS</span>
          <ul>
            {analysis.map((observation) => (
              <li key={observation}>{observation}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {report.newlyUnlocked.length > 0 ? (
        <div className="battle-statistics__unlocks">
          <span>NEW DECORATIONS</span>
          {report.newlyUnlocked.map((id) => {
            const achievement = ACHIEVEMENTS.find(
              (candidate) => candidate.id === (id as AchievementId),
            );
            return achievement ? <strong key={id}>{achievement.title}</strong> : null;
          })}
        </div>
      ) : null}
    </section>
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
          const profile = UNIT_PROFILES[unit];
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
              title={`${profile?.description ?? humanize(unit)} ${profile?.tacticalNote ?? ''}`}
            >
              <AssetPreview
                className="unit-button__icon"
                id={`unit.${unit}`}
                label={profile?.label ?? humanize(unit)}
              />
              <span className="unit-button__copy">
                <strong>{profile?.label ?? humanize(unit)}</strong>
                <small className="unit-button__role">{profile?.role}</small>
                <small className="unit-button__description">{profile?.description}</small>
              </span>
              <small className="unit-button__price">
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
  demolish: { label: 'Demolish', instruction: 'Destroy permanently · no refund' },
  recycle: { label: 'Recycle', instruction: 'Engineer recovers one third of cost' },
};

function ForceRoster({
  force,
  groups,
  onRecallGroup,
}: {
  force: ForceSummary;
  groups: readonly ControlGroupSummary[];
  onRecallGroup(slot: number): void;
}): JSX.Element {
  return (
    <section className="force-roster" aria-label="Army overview">
      <div className="force-roster__units">
        {force.units.length > 0 ? (
          force.units.map((unit) => (
            <span key={unit.unitType} className={unit.selected > 0 ? 'is-selected' : ''}>
              <strong>{UNIT_PROFILES[unit.unitType]?.label ?? humanize(unit.unitType)}</strong>
              <b>
                {unit.total}
                {unit.selected > 0 ? `/${unit.selected}` : ''}
              </b>
            </span>
          ))
        ) : (
          <small>No field units</small>
        )}
      </div>
      {groups.length > 0 ? (
        <div className="force-roster__groups">
          {groups.map((group) => (
            <button
              type="button"
              key={group.slot}
              onClick={() => onRecallGroup(group.slot)}
              title={`Recall control group ${group.slot}`}
            >
              <kbd>{group.slot}</kbd>
              <span>{group.count}</span>
            </button>
          ))}
        </div>
      ) : (
        <small className="force-roster__hint">Ctrl + 1…9 assigns selected units</small>
      )}
    </section>
  );
}

function OrdersPanel({
  entity,
  onGather,
  onStop,
  onSwitchWeapon,
  onRemove,
}: {
  entity: SelectedEntitySummary;
  onGather(): void;
  onStop(): void;
  onSwitchWeapon(index: number): void;
  onRemove(action: 'demolish' | 'recycle'): void;
}): JSX.Element {
  const operationalCommands = entity.commands.filter(
    (command) => command !== 'demolish' && command !== 'recycle',
  );
  return (
    <div className="quick-orders">
      {entity.weaponLoadout ? (
        <WeaponBar loadout={entity.weaponLoadout} onSwitch={onSwitchWeapon} />
      ) : null}
      {entity.kind === 'resource' ? (
        <WorkspaceEmpty
          title="Ore field"
          copy="Select a harvester and right-click this field to begin extraction."
        />
      ) : null}
      {entity.kind === 'building' && operationalCommands.length === 0 ? (
        <WorkspaceEmpty
          title={
            entity.constructionProgress !== undefined
              ? 'Construction in progress'
              : 'Automatic facility'
          }
          copy={
            entity.constructionProgress !== undefined
              ? `Operational systems unlock at 100% · ${Math.round(entity.constructionProgress * 100)}% complete.`
              : 'This structure operates automatically and has no direct orders.'
          }
        />
      ) : null}
      {entity.commands.map((command) => {
        const help = COMMAND_HELP[command];
        const action =
          command === 'gather'
            ? onGather
            : command === 'stop'
              ? onStop
              : command === 'demolish' || command === 'recycle'
                ? () => onRemove(command)
                : null;
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

/**
 * Silent Extraction only: manual weapon switching for the operative's loadout.
 * Rendered above the standard orders list whenever the selected unit carries a
 * `WeaponLoadout` (see `entityReadout`/`EntitySnapshot.weaponLoadout`).
 */
function WeaponBar({
  loadout,
  onSwitch,
}: {
  loadout: NonNullable<SelectedEntitySummary['weaponLoadout']>;
  onSwitch(index: number): void;
}): JSX.Element {
  return (
    <div className="quick-orders__weapons" role="group" aria-label="Weapon loadout">
      {loadout.weapons.map((weapon, index) => (
        <button
          type="button"
          key={weapon.id}
          className={`command-button${index === loadout.activeIndex ? ' command-button--active' : ''}`}
          onClick={() => onSwitch(index)}
          title={`${humanize(weapon.id)} · ${weapon.damage} dmg · range ${weapon.range}`}
        >
          <kbd>{index + 1}</kbd>
          <span className="command-button__copy">
            <strong>{humanize(weapon.id)}</strong>
          </span>
        </button>
      ))}
    </div>
  );
}

function isTutorialBuildObjective(step: TutorialStep, building: string): boolean {
  return (
    (step === 'power' && building === 'power_plant') ||
    step === building ||
    (step === 'defense' && (building === 'concrete_wall' || building === 'turret'))
  );
}

function TutorialChecklist({ current }: { current: TutorialStep }): JSX.Element {
  const steps = Object.entries(TUTORIAL).filter(([step]) => step !== 'complete') as [
    TutorialStep,
    (typeof TUTORIAL)[TutorialStep],
  ][];
  const currentIndex = steps.findIndex(([step]) => step === current);
  return (
    <ol className="tutorial-checklist" aria-label="Base construction objectives">
      {steps.map(([step, briefing], index) => (
        <li
          key={step}
          className={
            current === 'complete' || index < currentIndex
              ? 'is-complete'
              : step === current
                ? 'is-current'
                : ''
          }
        >
          <span>{current === 'complete' || index < currentIndex ? '✓' : briefing.number}</span>
          {briefing.title}
        </li>
      ))}
    </ol>
  );
}

function ConfirmationDialog({
  title,
  copy,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  copy: string;
  confirmLabel: string;
  onConfirm(): void;
  onCancel(): void;
}): JSX.Element {
  return (
    <div className="setup-overlay" role="presentation">
      <section className="pause-dialog steel-panel" role="dialog" aria-modal="true">
        <span className="panel-kicker">STRUCTURE CONTROL</span>
        <strong>{title}</strong>
        <span>{copy}</span>
        <div className="match-dialog__actions">
          <button type="button" className="metal-button metal-button--danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="metal-button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
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
  musicMuted,
  musicVolume,
  assets,
  fps,
  baseOperational,
  aiActivationSeconds,
  objective,
  onClose,
  onMutedChange,
  onVolumeChange,
  onMusicMutedChange,
  onMusicVolumeChange,
}: {
  audioMuted: boolean;
  audioVolume: number;
  musicMuted: boolean;
  musicVolume: number;
  assets: number;
  fps: number;
  baseOperational: boolean;
  aiActivationSeconds: number;
  objective: string;
  onClose(): void;
  onMutedChange(muted: boolean): void;
  onVolumeChange(volume: number): void;
  onMusicMutedChange(muted: boolean): void;
  onMusicVolumeChange(volume: number): void;
}): JSX.Element {
  const controls = [
    ['LMB', 'Select unit'],
    ['LMB drag', 'Select squad'],
    ['RMB', 'Move or attack'],
    ['MMB drag', 'Pan camera'],
    ['Double LMB', 'Select same unit type'],
    ['Ctrl + 1…9', 'Assign control group'],
    ['1…9 / double', 'Recall / center group'],
    ['Wheel', 'Zoom at cursor'],
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
            <label className="setup-toggle">
              <input
                type="checkbox"
                checked={!musicMuted}
                onChange={(event) => onMusicMutedChange(!event.target.checked)}
              />
              <span>Ambient music enabled</span>
            </label>
            <label className="setup-volume">
              <span>Music volume</span>
              <strong>{Math.round(musicVolume * 100)}%</strong>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={musicVolume}
                disabled={musicMuted}
                onChange={(event) => onMusicVolumeChange(Number(event.target.value))}
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

function AssetPreview({
  className,
  id,
  label,
}: {
  className: string;
  id: string;
  label: string;
}): JSX.Element {
  const url = UI_ASSET_PREVIEW_URLS[id as UiAssetPreviewId];
  return (
    <span className={className} aria-hidden="true">
      {url ? <img src={url} alt="" /> : <span>{label.slice(0, 2).toUpperCase()}</span>}
    </span>
  );
}
