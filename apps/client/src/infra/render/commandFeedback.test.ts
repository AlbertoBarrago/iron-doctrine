import { describe, expect, it } from 'vitest';
import {
  COMMAND_FEEDBACK_DURATION_MS,
  commandFeedbackFrame,
  type CommandFeedback,
} from './commandFeedback.js';

const feedback: CommandFeedback = {
  kind: 'move',
  worldX: 4,
  worldY: 8,
  startedAt: 100,
};

describe('command feedback animation', () => {
  it('expands and fades over its lifetime', () => {
    const start = commandFeedbackFrame(feedback, 100)!;
    const middle = commandFeedbackFrame(feedback, 100 + COMMAND_FEEDBACK_DURATION_MS / 2)!;
    expect(middle.scale).toBeGreaterThan(start.scale);
    expect(middle.alpha).toBeLessThan(start.alpha);
  });

  it('expires after the configured duration', () => {
    expect(commandFeedbackFrame(feedback, 100 + COMMAND_FEEDBACK_DURATION_MS)).toBeNull();
  });
});
