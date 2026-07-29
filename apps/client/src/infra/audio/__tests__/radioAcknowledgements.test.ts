import { describe, expect, it } from 'vitest';
import { radioAcknowledgement } from '../radioAcknowledgements.js';

describe('unit radio acknowledgements', () => {
  it('cycles predictably through generic command responses', () => {
    expect(radioAcknowledgement('move', undefined, 0)).toBe('Ricevuto');
    expect(radioAcknowledgement('move', undefined, 1)).toBe('In movimento');
    expect(radioAcknowledgement('move', undefined, 3)).toBe('Ricevuto');
  });

  it('uses concise role-specific responses when available', () => {
    expect(radioAcknowledgement('attack', 'tank', 0)).toBe('Cannone pronto');
    expect(radioAcknowledgement('gather', 'harvester', 0)).toBe('Avvio raccolta');
    expect(radioAcknowledgement('move', 'medic', 0)).toBe('Medico in movimento');
    expect(radioAcknowledgement('stop', 'engineer', 0)).toBe('Ingegnere in attesa');
  });

  it('falls back safely for unknown unit types and negative sequences', () => {
    expect(radioAcknowledgement('attack', 'future_unit', 0)).toBe('Bersaglio acquisito');
    expect(radioAcknowledgement('stop', undefined, -1)).toBe('In attesa di ordini');
  });
});
