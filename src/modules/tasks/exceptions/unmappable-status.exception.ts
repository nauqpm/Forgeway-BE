import { BadRequestException } from '@nestjs/common';

export class UnmappableStatusException extends BadRequestException {
  constructor(targetType: string, reason?: string) {
    super(
      reason ??
        `Current task status cannot be mapped to the ${targetType} workflow`,
    );
  }
}
