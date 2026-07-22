import { useState } from 'react';
import type { Difficulty } from '@iron/engine';
import type { MapCatalogEntry } from '../maps/mapCatalog.js';
import {
  DEFAULT_SKIRMISH_SETTINGS,
  type EnemyStartingForce,
  type GracePeriodSeconds,
  type SkirmishConfig,
} from '../game/skirmishConfig.js';

export function StartScreen({
  maps,
  onStart,
  onOpenEditor,
}: {
  maps: MapCatalogEntry[];
  onStart: (config: SkirmishConfig) => void;
  onOpenEditor: () => void;
}): JSX.Element {
  const [mapId, setMapId] = useState(maps[0]?.id ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_SKIRMISH_SETTINGS.difficulty);
  const [gracePeriodSeconds, setGracePeriodSeconds] = useState<GracePeriodSeconds>(
    DEFAULT_SKIRMISH_SETTINGS.gracePeriodSeconds,
  );
  const [enemyStartingForce, setEnemyStartingForce] = useState<EnemyStartingForce>(
    DEFAULT_SKIRMISH_SETTINGS.enemyStartingForce,
  );
  const selectedMap = maps.find((entry) => entry.id === mapId) ?? maps[0];

  return (
    <main className="start-screen">
      <div className="start-screen__scanline" />
      <section className="start-screen__content">
        <div className="eyebrow">OPERATION IRON DAWN // 06:00 HOURS</div>
        <h1>
          IRON
          <br />
          DOCTRINE
        </h1>
        <p className="start-screen__lead">
          Establish your base, grow the war machine and eliminate the red command structure.
        </p>

        <div className="briefing-grid">
          <article>
            <span className="briefing-grid__number">01</span>
            <strong>Select</strong>
            <p>Left-click a unit or drag a box around your squad.</p>
          </article>
          <article>
            <span className="briefing-grid__number">02</span>
            <strong>Command</strong>
            <p>Right-click terrain to move. Right-click red forces to attack.</p>
          </article>
          <article>
            <span className="briefing-grid__number">03</span>
            <strong>Expand</strong>
            <p>Place structures and produce reinforcements before the enemy activates.</p>
          </article>
        </div>

        <section className="skirmish-setup steel-panel" aria-label="Skirmish setup">
          <div className="skirmish-setup__heading">
            <span>MISSION PARAMETERS</span>
            <strong>Skirmish setup</strong>
          </div>
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
            <span>AI difficulty</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as Difficulty)}
            >
              <option value="easy">Easy</option>
              <option value="normal">Normal</option>
              <option value="hard">Hard</option>
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
        </section>

        <div className="start-screen__actions">
          <button
            className="primary-action"
            disabled={!selectedMap}
            onClick={() => {
              if (!selectedMap) return;
              onStart({
                map: selectedMap.map,
                difficulty,
                gracePeriodSeconds,
                enemyStartingForce,
              });
            }}
          >
            Start skirmish
          </button>
          <button className="secondary-action" onClick={onOpenEditor}>
            Open map editor
          </button>
        </div>
      </section>

      <aside className="start-screen__objective">
        <div className="start-screen__stamp">
          FIELD ORDER
          <br />
          ID-001
        </div>
        <span>PRIMARY OBJECTIVE</span>
        <strong>Destroy the enemy construction yard</strong>
        <p>Green forces are yours. Red forces are hostile. Protect your own command structure.</p>
      </aside>
    </main>
  );
}
