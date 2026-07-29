import type { EntitySnapshot } from '@iron/engine';

export type AuthoredBuildingType = 'construction_yard' | 'power_plant' | 'barracks' | 'factory';

export type BuildingAnimationName =
  'construction' | 'complete' | 'idle' | 'service' | 'generate' | 'produce' | 'exit';

export interface BuildingAnimationFrame {
  state: BuildingAnimationName;
  step: number;
}

export interface BuildingAnimationInput {
  entity: EntitySnapshot;
  presentationTime: number;
  constructionProgress: number;
  servicing?: boolean | undefined;
}

interface AnimationDefinition {
  frames: number;
  frameSeconds: number;
  loop: boolean;
}

interface TrackedBuilding {
  buildingType: AuthoredBuildingType;
  constructionProgress: number;
  queueLength: number;
  loopState?: BuildingAnimationName | undefined;
  loopStartedAt: number;
  oneShot?:
    | {
        state: 'complete' | 'exit';
        startedAt: number;
      }
    | undefined;
  pendingExit?: boolean;
}

const ANIMATIONS: Record<BuildingAnimationName, AnimationDefinition> = {
  construction: { frames: 4, frameSeconds: 0, loop: false },
  complete: { frames: 4, frameSeconds: 0.1, loop: false },
  idle: { frames: 1, frameSeconds: 0, loop: false },
  service: { frames: 4, frameSeconds: 0.12, loop: true },
  generate: { frames: 6, frameSeconds: 0.12, loop: true },
  produce: { frames: 8, frameSeconds: 0.1, loop: true },
  exit: { frames: 6, frameSeconds: 0.1, loop: false },
};

const STATE_FRAMES: Record<AuthoredBuildingType, Partial<Record<BuildingAnimationName, number>>> = {
  construction_yard: { construction: 4, complete: 4, idle: 1, service: 4 },
  power_plant: { construction: 4, complete: 4, generate: 6 },
  barracks: { construction: 4, complete: 4, idle: 1, produce: 6, exit: 4 },
  factory: { construction: 4, complete: 4, idle: 1, produce: 8, exit: 6 },
};

export function servicingConstructionYards(
  entities: readonly EntitySnapshot[],
): ReadonlySet<number> {
  const yards = entities.filter(
    (entity) => entity.kind === 'building' && entity.buildingType === 'construction_yard',
  );
  const servicing = new Set<number>();

  for (const entity of entities) {
    if (
      entity.kind !== 'unit' ||
      entity.unitType !== 'harvester' ||
      entity.cargo?.phase !== 'depositing'
    ) {
      continue;
    }

    let closestYard: EntitySnapshot | undefined;
    for (const candidate of yards) {
      if (candidate.owner !== entity.owner) continue;
      if (closestYard === undefined) {
        closestYard = candidate;
        continue;
      }

      const candidateDistance = Math.hypot(entity.x - candidate.x, entity.y - candidate.y);
      const closestDistance = Math.hypot(entity.x - closestYard.x, entity.y - closestYard.y);
      if (
        candidateDistance < closestDistance ||
        (candidateDistance === closestDistance && candidate.id < closestYard.id)
      ) {
        closestYard = candidate;
      }
    }

    if (closestYard) servicing.add(closestYard.id);
  }

  return servicing;
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(1, progress));
}

function constructionFrame(progress: number): BuildingAnimationFrame {
  const frames = ANIMATIONS.construction.frames;
  return {
    state: 'construction',
    step: Math.min(frames - 1, Math.floor(clampProgress(progress) * frames)),
  };
}

function baseState(
  buildingType: AuthoredBuildingType,
  queueLength: number,
  servicing: boolean,
): BuildingAnimationName {
  switch (buildingType) {
    case 'construction_yard':
      return servicing ? 'service' : 'idle';
    case 'power_plant':
      return 'generate';
    case 'barracks':
    case 'factory':
      return queueLength > 0 ? 'produce' : 'idle';
  }
}

function frameCount(buildingType: AuthoredBuildingType, state: BuildingAnimationName): number {
  return STATE_FRAMES[buildingType][state] ?? ANIMATIONS[state].frames;
}

function elapsedStep(
  buildingType: AuthoredBuildingType,
  state: BuildingAnimationName,
  elapsed: number,
): number {
  const definition = ANIMATIONS[state];
  const frames = frameCount(buildingType, state);
  if (frames <= 1 || definition.frameSeconds <= 0) return 0;
  const rawStep = Math.floor(Math.max(0, elapsed) / definition.frameSeconds);
  return definition.loop ? rawStep % frames : Math.min(frames - 1, rawStep);
}

function oneShotFinished(
  buildingType: AuthoredBuildingType,
  oneShot: NonNullable<TrackedBuilding['oneShot']>,
  presentationTime: number,
): boolean {
  const definition = ANIMATIONS[oneShot.state];
  return (
    presentationTime - oneShot.startedAt + 1e-9 >=
    frameCount(buildingType, oneShot.state) * definition.frameSeconds
  );
}

export class BuildingAnimationState {
  private readonly tracked = new Map<number, TrackedBuilding>();
  private readonly seen = new Set<number>();

  resolve(input: BuildingAnimationInput): BuildingAnimationFrame {
    const buildingType = input.entity.buildingType as AuthoredBuildingType;
    const progress = clampProgress(input.constructionProgress);
    const queueLength = input.entity.production?.queue.length ?? 0;
    const previous = this.tracked.get(input.entity.id);
    this.seen.add(input.entity.id);

    const tracked =
      previous?.buildingType === buildingType
        ? previous
        : {
            buildingType,
            constructionProgress: progress,
            queueLength,
            loopStartedAt: input.presentationTime,
          };

    const completedNow =
      previous !== undefined && previous.constructionProgress < 1 && progress >= 1;
    const queueDecremented =
      previous !== undefined && progress >= 1 && queueLength < previous.queueLength;

    tracked.constructionProgress = progress;
    tracked.queueLength = queueLength;
    this.tracked.set(input.entity.id, tracked);

    if (progress < 1) {
      tracked.oneShot = undefined;
      tracked.pendingExit = false;
      tracked.loopState = undefined;
      return constructionFrame(progress);
    }

    if (completedNow) {
      tracked.oneShot = { state: 'complete', startedAt: input.presentationTime };
    } else if (queueDecremented) {
      if (tracked.oneShot?.state === 'complete') tracked.pendingExit = true;
      else tracked.oneShot = { state: 'exit', startedAt: input.presentationTime };
    }

    if (tracked.oneShot) {
      if (!oneShotFinished(buildingType, tracked.oneShot, input.presentationTime)) {
        return {
          state: tracked.oneShot.state,
          step: elapsedStep(
            buildingType,
            tracked.oneShot.state,
            input.presentationTime - tracked.oneShot.startedAt,
          ),
        };
      }
      tracked.oneShot = undefined;
      if (tracked.pendingExit) {
        tracked.pendingExit = false;
        tracked.oneShot = { state: 'exit', startedAt: input.presentationTime };
        return { state: 'exit', step: 0 };
      }
    }

    const state = baseState(buildingType, queueLength, input.servicing ?? false);
    if (tracked.loopState !== state) {
      tracked.loopState = state;
      tracked.loopStartedAt = input.presentationTime;
    }
    return {
      state,
      step: elapsedStep(buildingType, state, input.presentationTime - tracked.loopStartedAt),
    };
  }

  beginFrame(): void {
    this.seen.clear();
  }

  endFrame(): void {
    for (const id of this.tracked.keys()) {
      if (!this.seen.has(id)) this.tracked.delete(id);
    }
  }
}
