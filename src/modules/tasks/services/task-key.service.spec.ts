import { TaskKeyService } from './task-key.service';

describe('TaskKeyService', () => {
  let service: TaskKeyService;

  beforeEach(() => {
    service = new TaskKeyService();
  });

  it('should create Jira-style task key from camel case workspace name', () => {
    expect(service.create('TestKanban', 1)).toBe('TESKB-1');
  });

  it('should create task key from separated workspace words', () => {
    expect(service.create('Test Kanban', 12)).toBe('TESKB-12');
  });

  it('should fallback when workspace name is missing', () => {
    expect(service.create(undefined, 1)).toBe('TASK-1');
  });
});
