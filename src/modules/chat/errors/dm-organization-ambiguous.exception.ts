import { ConflictException } from '@nestjs/common';

export class DmOrganizationAmbiguousException extends ConflictException {
  constructor() {
    super('DM participants share multiple active organizations');
  }
}
