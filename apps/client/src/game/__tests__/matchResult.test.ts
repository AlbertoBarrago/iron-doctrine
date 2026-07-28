import { describe, expect, it } from 'vitest';
import { matchResultActions } from '../matchResult.js';

describe('match result actions', () => {
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
