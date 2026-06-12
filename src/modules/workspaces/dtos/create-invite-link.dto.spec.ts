import { validate } from 'class-validator';
import { SPACE_ROLES } from '@/common/constants/space-role.constants';
import { CreateInviteLinkDto } from './create-invite-link.dto';

describe('CreateInviteLinkDto', () => {
  it('accepts a valid workspace role', async () => {
    const dto = new CreateInviteLinkDto();
    dto.role = SPACE_ROLES.MEMBER;

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });

  it('rejects a missing role', async () => {
    const dto = new CreateInviteLinkDto();

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'role')).toBe(true);
  });

  it('rejects an unsupported role', async () => {
    const dto = new CreateInviteLinkDto();
    dto.role = 'owner';

    const errors = await validate(dto);

    expect(errors.some(error => error.property === 'role')).toBe(true);
  });
});
