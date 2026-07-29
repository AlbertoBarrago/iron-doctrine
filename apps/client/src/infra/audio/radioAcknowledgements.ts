export type RadioOrder = 'move' | 'attack' | 'gather' | 'stop';

const GENERIC_LINES: Readonly<Record<RadioOrder, readonly string[]>> = {
  move: ['Ricevuto', 'In movimento', 'Sì, signore'],
  attack: ['Bersaglio acquisito', 'Apro il fuoco', 'Ingaggio il bersaglio'],
  gather: ['Avvio raccolta', 'Procedo al giacimento'],
  stop: ['Mantengo la posizione', 'In attesa di ordini'],
};

const UNIT_LINES: Readonly<Record<string, Partial<Record<RadioOrder, readonly string[]>>>> = {
  tank: {
    move: ['Corazzato in movimento', 'Ricevuto, avanziamo'],
    attack: ['Cannone pronto', 'Bersaglio agganciato'],
    stop: ['Posizione mantenuta'],
  },
  scout: {
    move: ['Ricognizione in marcia', 'Motori al massimo'],
    stop: ['Osservo il settore'],
  },
  harvester: {
    move: ['Raccolta in movimento'],
    gather: ['Avvio raccolta', 'Procedo al giacimento'],
    stop: ['Raccolta sospesa'],
  },
  engineer: {
    move: ['Ingegnere in movimento', 'Ricevuto, signore'],
    stop: ['Ingegnere in attesa'],
  },
  medic: {
    move: ['Medico in movimento', 'Arrivo subito'],
    stop: ['Postazione medica pronta'],
  },
  rifleman: {
    attack: ['Bersaglio acquisito', 'Apro il fuoco'],
  },
};

export function radioAcknowledgement(
  order: RadioOrder,
  unitType: string | undefined,
  sequence: number,
): string {
  const lines = (unitType ? UNIT_LINES[unitType]?.[order] : undefined) ?? GENERIC_LINES[order];
  const index = ((sequence % lines.length) + lines.length) % lines.length;
  return lines[index]!;
}
