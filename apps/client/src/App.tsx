import { useCallback, useEffect, useRef, useState } from 'react';
import { GameRenderer } from './infra/render/GameRenderer.js';
import { Hud } from './ui/Hud.js';
import { Minimap } from './ui/Minimap.js';
import { MapEditor } from './editor/MapEditor.js';
import { StartScreen } from './ui/StartScreen.js';
import { CampaignScreen } from './ui/CampaignScreen.js';
import { loadMapCatalog } from './maps/mapCatalog.js';
import {
  DEFAULT_SKIRMISH_SETTINGS,
  type SkirmishConfig,
} from './game/skirmishConfig.js';
import {
  completeCampaignMission,
  loadCampaignProgress,
} from './game/campaignProgress.js';
import type { CampaignMissionId } from './game/campaign.js';
import { useGameStore } from './state/gameStore.js';
import './ui/game.css';

type Mode = 'menu' | 'campaign' | 'game' | 'editor';

/** Root: switches between the live game and the map editor. */
export function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>('menu');
  const [, setCatalogRevision] = useState(0);
  const [, setCampaignRevision] = useState(0);
  const [skirmish, setSkirmish] = useState<SkirmishConfig | null>(null);
  const [gameReturnMode, setGameReturnMode] = useState<'menu' | 'campaign'>('menu');
  const maps = loadMapCatalog(localStorage);
  if (mode === 'menu') {
    return (
      <StartScreen
        maps={maps}
        onStart={(config) => {
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
        progress={loadCampaignProgress(localStorage)}
        onBack={() => setMode('menu')}
        onDeploy={(mission) => {
          if (!mission.runtimeMission || !maps[0]) return;
          setGameReturnMode('campaign');
          setSkirmish({
            ...DEFAULT_SKIRMISH_SETTINGS,
            mission: mission.runtimeMission,
            map: maps[0].map,
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
      onMissionComplete={(mission) => {
        completeCampaignMission(localStorage, mission);
        setCampaignRevision((current) => current + 1);
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
  onMissionComplete,
  onExit,
}: {
  config: SkirmishConfig;
  onMissionComplete(mission: CampaignMissionId): void;
  onExit(): void;
}): JSX.Element {
  const [session, setSession] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [quitConfirmationOpen, setQuitConfirmationOpen] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0.7);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialAudio = useRef({ muted: audioMuted, volume: audioVolume });
  const completionReported = useRef(false);
  const tutorialStep = useGameStore((state) => state.tutorialStep);
  const match = useGameStore((state) => state.match);
  const paused = setupOpen || manualPaused || quitConfirmationOpen;

  useEffect(() => {
    void session;
    const el = containerRef.current;
    if (!el || rendererRef.current) return;
    const renderer = new GameRenderer(el);
    rendererRef.current = renderer;
    void renderer.start(config).then(() => {
      renderer.attachMinimap(minimapCanvasRef.current);
      renderer.setAudioMuted(initialAudio.current.muted);
      renderer.setAudioVolume(initialAudio.current.volume);
    });
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [config, session]);

  useEffect(() => {
    void session;
    completionReported.current = false;
  }, [session]);

  useEffect(() => {
    if (completionReported.current) return;
    let completedMission: CampaignMissionId | null = null;
    if (config.mission === 'base_foundations' && tutorialStep === 'complete') {
      completedMission = 'base_foundations';
    } else if (
      config.mission === 'first_contact' &&
      match?.status === 'finished' &&
      match.winner === 0
    ) {
      completedMission = 'first_contact';
    }
    if (!completedMission) return;
    completionReported.current = true;
    onMissionComplete(completedMission);
  }, [config.mission, match, onMissionComplete, tutorialStep]);

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
      <Hud
        mission={config.mission}
        minimap={<Minimap onCanvas={attachMinimap} onClick={minimapClick} />}
        setupOpen={setupOpen}
        paused={manualPaused}
        audioMuted={audioMuted}
        audioVolume={audioVolume}
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
        onQueueProduction={(unit) => rendererRef.current?.queueProduction(unit)}
        onCancelProduction={() => rendererRef.current?.cancelProduction()}
        onPlaceBuilding={(building) => rendererRef.current?.beginBuildingPlacement(building)}
        onCancelPlacement={() => rendererRef.current?.cancelBuildingPlacement()}
        onGather={() => rendererRef.current?.gatherWithSelectedHarvesters()}
        onStop={() => rendererRef.current?.stopSelectedUnits()}
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
              <button
                type="button"
                className="metal-button metal-button--primary"
                onClick={onExit}
              >
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
