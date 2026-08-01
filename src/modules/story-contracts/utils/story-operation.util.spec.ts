import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { runStoryOperation } from './story-operation.util';

describe('runStoryOperation boundary behavior', () => {
  const session = {
    withTransaction: jest.fn(),
    endSession: jest.fn(),
  };
  const connection = { startSession: jest.fn() };
  const operationModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  };
  const input = {
    workspaceId: 'workspace-1',
    actorId: 'user-1',
    operation: 'story.submit',
    key: 'request-1',
    resourceId: 'contract-1',
    request: { draftId: 'draft-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    connection.startSession.mockResolvedValue(session);
    session.withTransaction.mockImplementation(async work => work());
    operationModel.findOne.mockResolvedValue(null);
    operationModel.create.mockResolvedValue([]);
  });

  it.each(['   ', 'x'.repeat(201)])(
    'rejects an invalid idempotency key before starting a transaction',
    async key => {
      await expect(
        runStoryOperation(
          connection as any,
          operationModel as any,
          { ...input, key },
          jest.fn(),
        ),
      ).rejects.toEqual(new BadRequestException('Invalid Idempotency-Key'));
      expect(connection.startSession).not.toHaveBeenCalled();
    },
  );

  it('runs a normal transaction when no idempotency key is supplied', async () => {
    const work = jest.fn().mockResolvedValue({ version: 1 });

    await expect(
      runStoryOperation(
        connection as any,
        undefined,
        { ...input, key: undefined },
        work,
      ),
    ).resolves.toEqual({ version: 1 });
    expect(work).toHaveBeenCalledWith(session);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });

  it('fails closed when a keyed operation has no persistence model', async () => {
    await expect(
      runStoryOperation(connection as any, undefined, input, jest.fn()),
    ).rejects.toEqual(
      new InternalServerErrorException(
        'Story idempotency storage is unavailable',
      ),
    );
    expect(connection.startSession).not.toHaveBeenCalled();
  });

  it('rethrows a non-duplicate persistence failure', async () => {
    const failure = new Error('storage unavailable');
    operationModel.create.mockRejectedValue(failure);

    await expect(
      runStoryOperation(
        connection as any,
        operationModel as any,
        input,
        jest.fn().mockResolvedValue({ version: 1 }),
      ),
    ).rejects.toBe(failure);
    expect(operationModel.findOne).toHaveBeenCalledTimes(1);
  });

  it('rethrows a duplicate race when no winning operation can be read', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 11000 });
    operationModel.create.mockRejectedValue(duplicate);
    operationModel.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    await expect(
      runStoryOperation(
        connection as any,
        operationModel as any,
        input,
        jest.fn().mockResolvedValue({ version: 1 }),
      ),
    ).rejects.toBe(duplicate);
    expect(operationModel.findOne).toHaveBeenCalledTimes(2);
  });
});
