import { useState } from 'react';
import type { Difficulty } from '@iron/engine';
import type { MapCatalogEntry } from '../maps/mapCatalog.js';
import {
  DEFAULT_SKIRMISH_SETTINGS,
  type EnemyStartingForce,
  type GracePeriodSeconds,
  type SkirmishConfig,
} from '../game/skirmishConfig.js';

type MenuScreen = 'main' | 'setup';

export function StartScreen({
  maps,
  onStart,
  onOpenEditor,
}: {
  maps: MapCatalogEntry[];
  onStart: (config: SkirmishConfig) => void;
  onOpenEditor: () => void;
}): JSX.Element {
  const [screen, setScreen] = useState<MenuScreen>('main');
  const [mapId, setMapId] = useState(maps[0]?.id ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_SKIRMISH_SETTINGS.difficulty);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState<GracePeriodSeconds>(
    DEFAULT_SKIRMISH_SETTINGS.gracePeriodSeconds,
  );
  const [enemyStartingForce, setEnemyStartingForce] = useState<EnemyStartingForce>(
    DEFAULT_SKIRMISH_SETTINGS.enemyStartingForce,
  );
  const selectedMap = maps.find((entry) => entry.id === mapId) ?? maps[0];

  const startMission = (): void => {
    if (!selectedMap) return;
    onStart({
      map: selectedMap.map,
      difficulty,
      gracePeriodSeconds,
      enemyStartingForce,
    });
  };

  return (
    <main className="start-screen">
      <div className="start-screen__sky" aria-hidden="true" />
      <div className="start-screen__horizon" aria-hidden="true">
        <span className="start-screen__tower" />
        <span className="start-screen__tank start-screen__tank--one" />
        <span className="start-screen__tank start-screen__tank--two" />
      </div>
      <div className="start-screen__scanline" aria-hidden="true" />
      <div className="start-screen__vignette" aria-hidden="true" />

      <section className="main-menu" aria-label="Iron Doctrine main menu">
        <header className="main-menu__title">
          <span>Field Command presents</span>
          <h1>
            <span>Iron</span>
            Doctrine
          </h1>
          <p>Real-time battlefield command</p>
        </header>

        {screen === 'main' ? (
          <nav className="main-menu__commands" aria-label="Main commands">
            <button type="button" disabled={!selectedMap} onClick={startMission}>
              <span className="main-menu__command-label">First Contact</span>
              <small className="main-menu__command-hint">Begin campaign</small>
            </button>
            <button type="button" onClick={() => setScreen('setup')}>
              <span className="main-menu__command-label">Mission setup</span>
              <small className="main-menu__command-hint">Configure skirmish</small>
            </button>
            <button type="button" onClick={onOpenEditor}>
              <span className="main-menu__command-label">Map editor</span>
              <small className="main-menu__command-hint">Battlefield archive</small>
            </button>
          </nav>
        ) : (
          <section className="mission-setup" aria-label="Mission setup">
            <header>
              <button
                type="button"
                className="mission-setup__back"
                onClick={() => setScreen('main')}
                aria-label="Back to main menu"
              >
                ‹
              </button>
              <div>
                <span>Operation configuration</span>
                <h2>Mission setup</h2>
              </div>
            </header>

            <div className="mission-setup__fields">
              <label>
                <span>Battlefield</span>
                <select value={mapId} onChange={(event) => setMapId(event.target.value)}>
                  {maps.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.map.name} {entry.source === 'local' ? '[LOCAL]' : '[OFFICIAL]'}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Enemy command</span>
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as Difficulty)}
                >
                  <option value="easy">Recruit</option>
                  <option value="normal">Veteran</option>
                  <option value="hard">Elite</option>
                </select>
              </label>
              <label>
                <span>Preparation time</span>
                <select
                  value={gracePeriodSeconds}
                  onChange={(event) =>
                    setGracePeriodSeconds(Number(event.target.value) as GracePeriodSeconds)
                  }
                >
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={300}>5 minutes</option>
                </select>
              </label>
              <label>
                <span>Enemy garrison</span>
                <select
                  value={enemyStartingForce}
                  onChange={(event) =>
                    setEnemyStartingForce(Number(event.target.value) as EnemyStartingForce)
                  }
                >
                  <option value={0}>None</option>
                  <option value={2}>Light — 2 units</option>
                  <option value={4}>Standard — 4 units</option>
                </select>
              </label>
            </div>

            <button
              type="button"
              className="mission-setup__deploy"
              disabled={!selectedMap}
              onClick={startMission}
            >
              Deploy forces
            </button>
          </section>
        )}

        <footer className="main-menu__status">
          <span>
            <i aria-hidden="true" /> Command link online
          </span>
          <span>Build 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
