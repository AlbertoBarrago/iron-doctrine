import { describe, expect, it } from 'vitest';
import { battleReportVictory, matchResultActions } from '../matchResult.js';

describe('match result actions', () => {
  it('treats Base Foundations tutorial completion as a reportable victory', () => {
    expect(battleReportVictory('base_foundations', false, null)).toBeNull();
    expect(battleReportVictory('base_foundations', true, null)).toBe(true);
  });

  it('uses the normal match outcome for combat operations', () => {
    expect(
      battleReportVictory('first_contact', false, { status: 'finished', winner: 1 }),
    ).toBe(false);
  });

  it('continues the campaign after a campaign victory', () => {
    expect(matchResultActions('first_contact', 0)).toEqual({
      primary: 'exit',
      primaryLabel: 'Continue campaign',
      secondary: 'restart',
      secondaryLabel: 'Replay mission',
    });
  });

  it('prioritizes retrying a defeated campaign mission', () => {
    expect(matchResultActions('first_contact', 1)).toMatchObject({
      primary: 'restart',
      primaryLabel: 'Retry mission',
      secondaryLabel: 'Return to campaign',
    });
  });

  it('keeps skirmish results scoped to the main menu', () => {
    expect(matchResultActions('skirmish', 0)).toMatchObject({
      primary: 'restart',
      primaryLabel: 'Restart skirmish',
      secondaryLabel: 'Return to main menu',
    });
  });
});
