import { TaskUpdateService } from './task-update.service';

describe('TaskUpdateService Story pin validation', () => {
  const createService = () => {
    const storyImpacts = { assertTaskVersion: jest.fn() };
    const taskAccess = {
      toId: jest.fn(value => String(value)),
    };
    const service = new TaskUpdateService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      taskAccess as any,
      {} as any,
      {} as any,
      storyImpacts as any,
    );

    return { service, storyImpacts };
  };

  it('does not revalidate stale existing pins for an unrelated metadata edit', async () => {
    const { service, storyImpacts } = createService();

    await (service as any).assertStoryPinUpdate(
      {
        storyContractId: 'contract-1',
        storyVersionId: 'superseded-version',
      },
      { title: 'Renamed task' },
      'workspace-1',
    );

    expect(storyImpacts.assertTaskVersion).not.toHaveBeenCalled();
  });

  it('validates an explicit Story relink against the current approved version', async () => {
    const { service, storyImpacts } = createService();

    await (service as any).assertStoryPinUpdate(
      {
        storyContractId: 'contract-1',
        storyVersionId: 'superseded-version',
      },
      {
        storyContractId: 'contract-1',
        storyVersionId: 'current-version',
      },
      'workspace-1',
    );

    expect(storyImpacts.assertTaskVersion).toHaveBeenCalledWith(
      'workspace-1',
      'contract-1',
      'current-version',
    );
  });
});
