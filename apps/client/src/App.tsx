import { useCallback, useEffect, useRef, useState } from 'react';
import { GameRenderer } from './infra/render/GameRenderer.js';
import { Hud } from './ui/Hud.js';
import { Minimap } from './ui/Minimap.js';
import { MapEditor } from './editor/MapEditor.js';
import { StartScreen } from './ui/StartScreen.js';
import { CampaignScreen } from './ui/CampaignScreen.js';
import {
  BLACK_DAWN_MAP,
  IRON_PASS_MAP,
  SIEGE_LINE_MAP,
  loadMapCatalog,
} from './maps/mapCatalog.js';
import {
  DEFAULT_SKIRMISH_SETTINGS,
  type MissionId,
  type SkirmishConfig,
} from './game/skirmishConfig.js';
import { completeCampaignMission, loadCampaignProgress } from './game/campaignProgress.js';
import {
  consumeChickenEasterEgg,
  createCommanderProfile,
  loadCommanderProfiles,
  recordCompletedMatch,
  selectCommanderProfile,
} from './game/commanderProfile.js';
import type { CampaignMissionId } from './game/campaign.js';
import { useGameStore } from './state/gameStore.js';
import type { MapDef } from '@iron/shared';
import type { MatchMetricsSnapshot } from '@iron/engine';
import { battleReportVictory } from './game/matchResult.js';
import {
  evaluateAchievements,
  loadAchievementProgress,
  type AchievementId,
} from './game/achievements.js';
import './ui/game.css';

type Mode = 'menu' | 'campaign' | 'game' | 'editor';

/** Authored maps for missions with a fixed, hand-designed battlefield. */
const CAMPAIGN_MAPS: Partial<Record<MissionId, MapDef>> = {
  iron_pass: IRON_PASS_MAP,
  siege_line: SIEGE_LINE_MAP,
  black_dawn: BLACK_DAWN_MAP,
};

/** Campaign missions completed by winning the match rather than a bespoke condition. */
const MATCH_VICTORY_MISSIONS: ReadonlySet<CampaignMissionId> = new Set([
  'first_contact',
  'iron_pass',
  'siege_line',
  'black_dawn',
]);

/** Root: switches between the live game and the map editor. */
export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('menu');
  const [, setCatalogRevision] = useState(0);
  const [, setCampaignRevision] = useState(0);
  const [skirmish, setSkirmish] = useState<SkirmishConfig | null>(null);
  const [gameReturnMode, setGameReturnMode] = useState<'menu' | 'campaign'>('menu');
  const [chickenEasterEgg, setChickenEasterEgg] = useState(false);
  const maps = loadMapCatalog(localStorage);
  const commanders = loadCommanderProfiles(localStorage);
  const activeCallsign = commanders.activeCallsign;
  if (mode === 'menu') {
    return (
      <StartScreen
        maps={maps}
        onStart={(config) => {
          setChickenEasterEgg(
            activeCallsign ? consumeChickenEasterEgg(localStorage, activeCallsign) : false,
          );
          setGameReturnMode('menu');
          setSkirmish(config);
          setMode('game');
        }}
        onOpenCampaign={() => setMode('campaign')}
        onOpenEditor={() => setMode('editor')}
      />
    );
  }
  if (mode === 'campaign') {
    return (
      <CampaignScreen
        key={activeCallsign ?? 'new-commander'}
        progress={
          activeCallsign ? loadCampaignProgress(localStorage, activeCallsign) : { completed: [] }
        }
        commanders={commanders}
        achievements={
          activeCallsign
            ? loadAchievementProgress(localStorage, activeCallsign)
            : { version: 2, unlocked: [], byMission: {} }
        }
        onCreateCommander={(callsign) => {
          createCommanderProfile(localStorage, callsign);
          setCampaignRevision((current) => current + 1);
        }}
        onSelectCommander={(callsign) => {
          selectCommanderProfile(localStorage, callsign);
          setCampaignRevision((current) => current + 1);
        }}
        onBack={() => setMode('menu')}
        onDeploy={(mission) => {
          if (!mission.runtimeMission || !maps[0]) return;
          setChickenEasterEgg(
            activeCallsign ? consumeChickenEasterEgg(localStorage, activeCallsign) : false,
          );
          setGameReturnMode('campaign');
          setSkirmish({
            ...DEFAULT_SKIRMISH_SETTINGS,
            mission: mission.runtimeMission,
            map: CAMPAIGN_MAPS[mission.runtimeMission] ?? maps[0].map,
          });
          setMode('game');
        }}
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
  return (
    <Game
      config={skirmish}
      chickenEasterEgg={chickenEasterEgg}
      onMissionComplete={(mission) => {
        if (activeCallsign) completeCampaignMission(localStorage, activeCallsign, mission);
        setCampaignRevision((current) => current + 1);
      }}
      onBattleReport={(metrics, victory) => {
        if (!activeCallsign) return [];
        recordCompletedMatch(localStorage, activeCallsign);
        return evaluateAchievements(
          localStorage,
          activeCallsign,
          metrics,
          victory,
          loadCampaignProgress(localStorage, activeCallsign).completed,
          skirmish.mission === 'skirmish' ? null : skirmish.mission,
        ).newlyUnlocked;
      }}
      onExit={() => {
        setSkirmish(null);
        setMode(gameReturnMode);
      }}
    />
  );
}

/**
 * The live game view. Mounts the Pixi/engine GameRenderer into a container div and
 * overlays the React HUD/minimap. Unmounting disposes the renderer (used when switching
 * to the editor). StrictMode double-invokes effects in dev, hence the duplicate guard.
 */
function Game({
  config,
  chickenEasterEgg,
  onMissionComplete,
  onBattleReport,
  onExit,
}: {
  config: SkirmishConfig;
  chickenEasterEgg: boolean;
  onMissionComplete(mission: CampaignMissionId): void;
  onBattleReport(metrics: MatchMetricsSnapshot, victory: boolean): AchievementId[];
  onExit(): void;
}): JSX.Element {
  const [session, setSession] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [quitConfirmationOpen, setQuitConfirmationOpen] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.7);
  const [musicMuted, setMusicMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.35);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialAudio = useRef({
    muted: audioMuted,
    volume: audioVolume,
    musicMuted,
    musicVolume,
  });
  const completionReported = useRef(false);
  const battleReportGenerated = useRef(false);
  const tutorialStep = useGameStore((state) => state.tutorialStep);
  const match = useGameStore((state) => state.match);
  const matchMetrics = useGameStore((state) => state.matchMetrics);
  const paused = setupOpen || manualPaused || quitConfirmationOpen;

  useEffect(() => {
    void session;
    const el = containerRef.current;
    if (!el || rendererRef.current) return;
    const renderer = new GameRenderer(el);
    rendererRef.current = renderer;
    void renderer
      .start(config, 123456789, {
        chickenEasterEgg: chickenEasterEgg && session === 0,
      })
      .then(() => {
        renderer.attachMinimap(minimapCanvasRef.current);
        renderer.setAudioMuted(initialAudio.current.muted);
        renderer.setAudioVolume(initialAudio.current.volume);
        renderer.setMusicMuted(initialAudio.current.musicMuted);
        renderer.setMusicVolume(initialAudio.current.musicVolume);
      });
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [chickenEasterEgg, config, session]);

  useEffect(() => {
    void session;
    completionReported.current = false;
    battleReportGenerated.current = false;
  }, [session]);

  useEffect(() => {
    if (completionReported.current) return;
    let completedMission: CampaignMissionId | null = null;
    if (config.mission === 'base_foundations' && tutorialStep === 'complete') {
      completedMission = 'base_foundations';
    } else if (
      match?.status === 'finished' &&
      match.winner === 0 &&
      MATCH_VICTORY_MISSIONS.has(config.mission as CampaignMissionId)
    ) {
      completedMission = config.mission as CampaignMissionId;
    }
    if (!completedMission) return;
    completionReported.current = true;
    onMissionComplete(completedMission);
  }, [config.mission, match, onMissionComplete, tutorialStep]);

  useEffect(() => {
    if (battleReportGenerated.current) return;
    const victory = battleReportVictory(config.mission, tutorialStep === 'complete', match);
    if (victory === null) return;
    const metrics =
      config.mission === 'base_foundations' ? rendererRef.current?.getMatchMetrics() : matchMetrics;
    if (!metrics) return;
    battleReportGenerated.current = true;
    const newlyUnlocked = onBattleReport(metrics, victory);
    useGameStore.getState().setBattleReport({
      metrics,
      victory,
      newlyUnlocked,
    });
  }, [config.mission, match, matchMetrics, onBattleReport, tutorialStep]);

  useEffect(() => {
    rendererRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const handleKeyboardControl = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (quitConfirmationOpen) {
        if (key === 'escape') {
          event.preventDefault();
          setQuitConfirmationOpen(false);
        }
        return;
      }
      if (key === 'q') {
        event.preventDefault();
        setQuitConfirmationOpen(true);
        return;
      }
      if (key !== 'p') return;
      event.preventDefault();
      setManualPaused((current) => !current);
    };
    window.addEventListener('keydown', handleKeyboardControl);
    return () => window.removeEventListener('keydown', handleKeyboardControl);
  }, [quitConfirmationOpen]);

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
      <Minimap onCanvas={attachMinimap} onClick={minimapClick} />
      <Hud
        mission={config.mission}
        setupOpen={setupOpen}
        paused={manualPaused}
        audioMuted={audioMuted}
        audioVolume={audioVolume}
        musicMuted={musicMuted}
        musicVolume={musicVolume}
        onSetupChange={(open) => {
          setSetupOpen(open);
        }}
        onPausedChange={setManualPaused}
        onAudioMutedChange={(muted) => {
          setAudioMuted(muted);
          rendererRef.current?.setAudioMuted(muted);
        }}
        onAudioVolumeChange={(volume) => {
          setAudioVolume(volume);
          rendererRef.current?.setAudioVolume(volume);
        }}
        onMusicMutedChange={(muted) => {
          setMusicMuted(muted);
          rendererRef.current?.setMusicMuted(muted);
        }}
        onMusicVolumeChange={(volume) => {
          setMusicVolume(volume);
          rendererRef.current?.setMusicVolume(volume);
        }}
        onQueueProduction={(unit) => rendererRef.current?.queueProduction(unit)}
        onCancelProduction={() => rendererRef.current?.cancelProduction()}
        onPlaceBuilding={(building) => rendererRef.current?.beginBuildingPlacement(building)}
        onCancelPlacement={() => rendererRef.current?.cancelBuildingPlacement()}
        onGather={() => rendererRef.current?.gatherWithSelectedHarvesters()}
        onStop={() => rendererRef.current?.stopSelectedUnits()}
        onRecallControlGroup={(slot) => rendererRef.current?.recallControlGroup(slot)}
        onRemoveBuilding={(recycle) => rendererRef.current?.removeSelectedBuilding(recycle)}
        onRestart={() => {
          setSetupOpen(false);
          setManualPaused(false);
          setSession((current) => current + 1);
        }}
        onExit={onExit}
      />
      {quitConfirmationOpen ? (
        <div className="setup-overlay" role="presentation">
          <section
            className="pause-dialog steel-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quit-confirmation-title"
          >
            <span className="panel-kicker">LEAVE BATTLEFIELD</span>
            <strong id="quit-confirmation-title">Quit mission?</strong>
            <span>Current battle progress will be lost.</span>
            <div className="match-dialog__actions">
              <button type="button" className="metal-button metal-button--primary" onClick={onExit}>
                Quit to main menu
              </button>
              <button
                type="button"
                className="metal-button"
                onClick={() => setQuitConfirmationOpen(false)}
              >
                Continue battle
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
