import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection } from 'mongoose';

@Injectable()
export class OrganizationTransactionService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async run<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
    let session: ClientSession;
    try {
      session = await this.connection.startSession();
    } catch {
      throw new InternalServerErrorException(
        'Organization lifecycle requires MongoDB transaction support',
      );
    }

    try {
      session.startTransaction();
      const result = await operation(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      if (session.inTransaction()) await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
