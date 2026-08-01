import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ClientSession, Connection, Model } from 'mongoose';
import { ErrorFactory } from '../../../common/factories/error.factory';
import { createStoryContentHash } from './story-content-hash.util';

type OperationInput = {
  workspaceId: string;
  actorId: string;
  operation: string;
  key?: string;
  resourceId: string;
  request: unknown;
};

const snapshot = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const STORY_OPERATION_REPLAY = Symbol('story-operation-replay');

export const isStoryOperationReplay = (value: unknown): boolean =>
  Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<symbol, unknown>)[STORY_OPERATION_REPLAY],
  );

export async function runStoryOperation<T>(
  connection: Connection,
  operationModel: Model<any> | undefined,
  input: OperationInput,
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const key = input.key?.trim();
  if (input.key !== undefined && (!key || key.length > 200)) {
    throw new BadRequestException('Invalid Idempotency-Key');
  }
  if (!key) return runTransaction(connection, work);
  if (!operationModel) {
    throw new InternalServerErrorException(
      'Story idempotency storage is unavailable',
    );
  }

  const identity = {
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    operation: input.operation,
    key,
  };
  const requestHash = createStoryContentHash(input.request);
  const replay = (record: any): T => {
    if (record.requestHash !== requestHash) {
      throw new ConflictException(ErrorFactory.idempotencyConflict());
    }
    const result = snapshot(record.responseSnapshot);
    if (result && typeof result === 'object') {
      Object.defineProperty(result, STORY_OPERATION_REPLAY, { value: true });
    }
    return result;
  };
  const existing = await operationModel.findOne(identity);
  if (existing) return replay(existing);

  try {
    return await runTransaction(connection, async session => {
      const result = snapshot(await work(session));
      await operationModel.create(
        [
          {
            ...identity,
            requestHash,
            resourceId: input.resourceId,
            responseSnapshot: result,
          },
        ],
        { session },
      );
      return result;
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 11000) throw error;
    const winner = await operationModel.findOne(identity);
    if (!winner) throw error;
    return replay(winner);
  }
}

async function runTransaction<T>(
  connection: Connection,
  work: (session: ClientSession) => Promise<T>,
): Promise<T> {
  const session = await connection.startSession();
  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
}
