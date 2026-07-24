import { useState, type ReactNode } from 'react';
import {
  CAMPAIGN_MISSIONS,
  campaignMission,
  type CampaignMission,
  type CampaignMissionId,
} from '../game/campaign.js';
import {
  campaignMissionStatus,
  type CampaignProgress,
} from '../game/campaignProgress.js';

export function CampaignScreen({
  progress,
  onBack,
  onDeploy,
}: {
  progress: CampaignProgress;
  onBack(): void;
  onDeploy(mission: CampaignMission): void;
}): JSX.Element {
  const [selectedId, setSelectedId] = useState<CampaignMissionId>(() => {
    const available = [...CAMPAIGN_MISSIONS]
      .reverse()
      .find((mission) => campaignMissionStatus(mission, progress) !== 'classified');
    return available?.id ?? 'base_foundations';
  });
  const selected = campaignMission(selectedId);
  const selectedStatus = campaignMissionStatus(selected, progress);
  const route = CAMPAIGN_MISSIONS.map(
    (mission) => `${mission.mapPosition.x},${mission.mapPosition.y}`,
  ).join(' ');

  return (
    <main className="campaign-screen">
      <div className="campaign-screen__scanlines" aria-hidden="true" />
      <header className="campaign-header">
        <button type="button" onClick={onBack} aria-label="Return to main menu">
          ‹ RETURN
        </button>
        <div>
          <span>FIELD COMMAND / CAMPAIGN THEATER</span>
          <h1>Operations Map</h1>
        </div>
        <div className="campaign-header__record">
          <span>OPERATIONS CLEARED</span>
          <strong>{String(progress.completed.length).padStart(2, '0')} / 05</strong>
        </div>
      </header>

      <div className="campaign-layout">
        <section className="operations-map" aria-label="Campaign operations map">
          <div className="operations-map__grid" aria-hidden="true" />
          <svg
            className="operations-map__route"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <polyline points={route} />
          </svg>
          <div className="operations-map__caption">
            <span>NORTHERN COMMAND THEATER</span>
            <strong>IRON DOCTRINE</strong>
          </div>
          {CAMPAIGN_MISSIONS.map((mission) => {
            const status = campaignMissionStatus(mission, progress);
            return (
              <button
                type="button"
                key={mission.id}
                className={`operation-node operation-node--${status}${
                  selectedId === mission.id ? ' is-selected' : ''
                }`}
                style={{ left: `${mission.mapPosition.x}%`, top: `${mission.mapPosition.y}%` }}
                onClick={() => setSelectedId(mission.id)}
                aria-pressed={selectedId === mission.id}
              >
                <span>{mission.operation}</span>
                <strong>{status === 'classified' ? 'CLASSIFIED' : mission.title}</strong>
              </button>
            );
          })}
          <div className="operations-map__legend">
            <span className="is-cleared">Cleared</span>
            <span className="is-active">Available</span>
            <span className="is-classified">Classified</span>
          </div>
        </section>

        <MissionBriefing
          mission={selected}
          status={selectedStatus}
          onDeploy={() => onDeploy(selected)}
        />
      </div>
    </main>
  );
}

function MissionBriefing({
  mission,
  status,
  onDeploy,
}: {
  mission: CampaignMission;
  status: ReturnType<typeof campaignMissionStatus>;
  onDeploy(): void;
}): JSX.Element {
  const classified = status === 'classified';
  return (
    <article className={`mission-dossier${classified ? ' is-classified' : ''}`}>
      <div className="mission-dossier__stripe" aria-hidden="true" />
      <header>
        <span>FIELD COMMAND — OPERATION ORDER {mission.operation}</span>
        <strong>{classified ? 'ACCESS RESTRICTED' : mission.title}</strong>
        <small>{classified ? 'CLEARANCE REQUIRED' : mission.region}</small>
      </header>

      <DossierSection label="Situation">
        <p>{mission.situation}</p>
      </DossierSection>
      <DossierSection label="Primary objective">
        <p>{mission.objective}</p>
      </DossierSection>
      <DossierSection label="Intelligence">
        <p>{mission.intelligence}</p>
      </DossierSection>

      <div className="mission-dossier__columns">
        <DossierSection label="Starting forces">
          <DossierList entries={mission.forces} />
        </DossierSection>
        <DossierSection label="Authorized assets">
          <DossierList entries={mission.authorized} />
        </DossierSection>
      </div>

      <DossierSection label="Resource assessment">
        <p>{mission.resources}</p>
      </DossierSection>

      <footer>
        <div className={`mission-stamp mission-stamp--${status}`}>
          {status === 'completed' ? 'CLEARED' : status === 'available' ? 'ACTIVE' : 'CLASSIFIED'}
        </div>
        <button
          type="button"
          disabled={classified || !mission.runtimeMission}
          onClick={onDeploy}
        >
          {status === 'completed' ? 'Replay operation' : 'Deploy operation'}
        </button>
      </footer>
    </article>
  );
}

function DossierSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className="dossier-section">
      <span>{label}</span>
      {children}
    </section>
  );
}

function DossierList({ entries }: { entries: readonly string[] }): JSX.Element {
  return (
    <ul>
      {entries.map((entry) => (
        <li key={entry}>{entry}</li>
      ))}
    </ul>
  );
}
