export type CommandFeedbackKind = 'select' | 'move' | 'attack' | 'gather' | 'build' | 'invalid';

export interface CommandFeedback {
  kind: CommandFeedbackKind;
  worldX: number;
  worldY: number;
  startedAt: number;
}

export interface CommandFeedbackFrame {
  alpha: number;
  scale: number;
}

export const COMMAND_FEEDBACK_DURATION_MS = 620;

export function commandFeedbackFrame(
  feedback: CommandFeedback,
  now: number,
): CommandFeedbackFrame | null {
  const progress = Math.max(0, (now - feedback.startedAt) / COMMAND_FEEDBACK_DURATION_MS);
  if (progress >= 1) return null;
  return {
    alpha: (1 - progress) ** 1.5,
    scale: 0.7 + progress * 0.9,
  };
}
