import { TASK_TYPES } from './task-status.constants';

describe('TASK_TYPES', () => {
  it('continues to support story tasks', () => {
    expect(TASK_TYPES).toContain('story');
  });
});
