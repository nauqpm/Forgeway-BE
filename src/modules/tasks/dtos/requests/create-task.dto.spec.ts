import { validate } from 'class-validator';
import { Types } from 'mongoose';
import { CreateTaskDto } from './create-task.dto';
import { UpdateTaskDto } from './update-task.dto';

describe('CreateTaskDto story pins', () => {
  const contractId = new Types.ObjectId().toString();
  const versionId = new Types.ObjectId().toString();

  const validateDto = (pins: Partial<CreateTaskDto>) =>
    validate(
      Object.assign(new CreateTaskDto(), {
        title: 'Pinned task',
        ...pins,
      }),
    );

  it('rejects a Story Contract pin without its exact Story Version pin', async () => {
    const errors = await validateDto({ storyContractId: contractId });

    expect(errors.some(error => error.constraints?.StoryPinsPaired)).toBe(true);
  });

  it('accepts both exact Story pins together', async () => {
    await expect(
      validateDto({ storyContractId: contractId, storyVersionId: versionId }),
    ).resolves.toEqual([]);
  });
});

describe('UpdateTaskDto story pins', () => {
  const contractId = new Types.ObjectId().toString();
  const versionId = new Types.ObjectId().toString();

  it('rejects either Story pin when its pair is absent', async () => {
    const contractOnly = await validate(
      Object.assign(new UpdateTaskDto(), { storyContractId: contractId }),
    );
    const versionOnly = await validate(
      Object.assign(new UpdateTaskDto(), { storyVersionId: versionId }),
    );

    expect(contractOnly).not.toEqual([]);
    expect(versionOnly).not.toEqual([]);
  });

  it('accepts both Story pins together and accepts an update without pins', async () => {
    await expect(
      validate(
        Object.assign(new UpdateTaskDto(), {
          storyContractId: contractId,
          storyVersionId: versionId,
        }),
      ),
    ).resolves.toEqual([]);
    await expect(
      validate(Object.assign(new UpdateTaskDto(), { title: 'Renamed task' })),
    ).resolves.toEqual([]);
  });
});
