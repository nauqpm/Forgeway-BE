import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserProfileDto } from './update-users.dto';

describe('UpdateUserProfileDto', () => {
  it('rejects mustChangePassword from profile updates', async () => {
    const dto = plainToInstance(UpdateUserProfileDto, {
      mustChangePassword: false,
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe('mustChangePassword');
  });
});
