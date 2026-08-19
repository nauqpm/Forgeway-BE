import { Types } from 'mongoose';

import { UsersController } from './users.controller';

describe('UsersController public profile', () => {
  it('returns only fields safe for an authenticated public profile', async () => {
    const id = new Types.ObjectId();
    const usersService = {
      getUserById: jest.fn().mockResolvedValue({
        _id: id,
        fullName: 'Sang Tran',
        email: 'sang@example.com',
        avatar: 'avatar.png',
        phone: '0900000000',
        gender: 'male',
        address: 'Private address',
        birthday: new Date('2000-01-01'),
      }),
    };
    const controller = new UsersController(usersService as never);

    await expect(controller.getPublicProfile(id.toString())).resolves.toEqual({
      _id: id.toString(),
      fullName: 'Sang Tran',
      email: 'sang@example.com',
      avatar: 'avatar.png',
    });
  });
});
