import { ForbiddenException } from '@nestjs/common';

export class DmOrganizationMismatchException extends ForbiddenException {
  constructor() {
    super('DM participants must share an active organization');
  }
}
