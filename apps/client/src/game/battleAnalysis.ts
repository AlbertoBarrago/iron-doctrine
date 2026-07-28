import type { MatchMetricsSnapshot } from '@iron/engine';
import { SIM_HZ } from '@iron/shared';

export function analyzeBattle(metrics: MatchMetricsSnapshot, victory: boolean): string[] {
  const durationMinutes = metrics.durationTicks / SIM_HZ / 60;
  const damageEfficiency =
    metrics.damageTaken === 0 ? metrics.damageDealt : metrics.damageDealt / metrics.damageTaken;
  const observations: string[] = [];

  if (victory && durationMinutes < 8) {
    observations.push('Decisive tempo: hostile command collapsed before minute eight.');
  } else if (durationMinutes >= 15) {
    observations.push('Extended engagement: the operation lasted more than fifteen minutes.');
  }

  if (damageEfficiency >= 2) {
    observations.push('Excellent damage economy: at least 2 damage dealt for every 1 received.');
  } else if (metrics.damageTaken > metrics.damageDealt) {
    observations.push('Negative damage trade: the force absorbed more punishment than it dealt.');
  }

  if (metrics.exploredPercent < 50) {
    observations.push('Limited reconnaissance: more than half the battlefield remained uncharted.');
  } else if (metrics.exploredPercent >= 99.5) {
    observations.push('Complete intelligence picture: the entire battlefield was charted.');
  }

  if (metrics.unitsLost === 0) {
    observations.push('Zero personnel losses recorded.');
  } else if (metrics.unitsDestroyed > metrics.unitsLost * 3) {
    observations.push('Favourable attrition: hostile unit losses exceeded yours by more than 3:1.');
  }

  return observations.slice(0, 3);
}
