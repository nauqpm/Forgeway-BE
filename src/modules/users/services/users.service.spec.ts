import { BadRequestException } from '@nestjs/common';

import { UsersRepository } from '../repositories/users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  const usersRepository = {};
  const eventEmitter = {
    emit: jest.fn(),
  };

  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(
      usersRepository as UsersRepository,
      eventEmitter as never,
    );
  });

  it('imports CSV files exported with a UTF-8 BOM header', async () => {
    jest.spyOn(service, 'findByEmail').mockResolvedValue(null);
    const createUserSpy = jest
      .spyOn(service, 'createUser')
      .mockResolvedValue({} as never);

    const csv = [
      '\uFEFFemployeeCode,fullName,email,defaultPassword,mustChangePassword',
      'EMP001,Jane Doe,jane@example.com,Default@123,true',
    ].join('\n');

    const result = await service.importUsersFromCsv(Buffer.from(csv, 'utf8'));

    expect(result).toEqual({
      success: true,
      insertedCount: 1,
      skippedCount: 0,
      errors: [],
    });
    expect(createUserSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        password: 'Default@123',
        mustChangePassword: true,
      }),
    );
  });

  it('skips duplicate emails found again in the same CSV file', async () => {
    jest.spyOn(service, 'findByEmail').mockResolvedValue(null);
    jest.spyOn(service, 'createUser').mockResolvedValue({} as never);

    const csv = [
      'employeeCode,fullName,email,defaultPassword,mustChangePassword',
      'EMP001,Jane Doe,jane@example.com,Default@123,true',
      'EMP002,Jane Clone,jane@example.com,Default@123,true',
    ].join('\n');

    const result = await service.importUsersFromCsv(Buffer.from(csv, 'utf8'));

    expect(result.insertedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    expect(result.errors).toContain('Dòng 3: Email bị trùng trong file CSV');
  });

  it('rejects CSV files missing the required import columns', async () => {
    const csv = ['employeeCode,fullName', 'EMP001,Jane Doe'].join('\n');

    await expect(
      service.importUsersFromCsv(Buffer.from(csv, 'utf8')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
