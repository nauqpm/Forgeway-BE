import { TaskDataTransformerService } from './task-data-transformer.service';

describe('TaskDataTransformerService search tokens', () => {
  let service: TaskDataTransformerService;

  beforeEach(() => {
    service = new TaskDataTransformerService();
  });

  it('generates search tokens from task key and title on create', () => {
    const data = service.transformCreateInput(
      {
        title: 'Registration',
        type: 'task',
        priority: 'medium',
        workspaceId: '64f000000000000000000001',
      },
      '64f000000000000000000001',
      '64f000000000000000000002',
      'ALTA-1',
    );

    expect(data.searchTokens).toEqual(
      expect.arrayContaining(['a', 'al', 'alta', 'r', 're', 'registration']),
    );
  });

  it('regenerates search tokens when title changes on update', () => {
    const data = service.transformUpdateInput(
      { title: 'Reset Password' },
      { key: 'ALTA-1', title: 'Registration' },
    );

    expect(data.searchTokens).toEqual(
      expect.arrayContaining(['a', 'al', 'r', 're', 'reset', 'p', 'pa']),
    );
  });
});
