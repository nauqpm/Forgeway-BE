import { Injectable } from '@nestjs/common';
import { LabelDto } from '../dtos/label.dto';
import { LabelDocument } from '../schemas/label.schema';

@Injectable()
export class LabelMapper {
  mapToDto(label: LabelDocument | any): LabelDto {
    const plainLabel =
      typeof label?.toObject === 'function' ? label.toObject() : label;

    return {
      id: this.toId(plainLabel._id || plainLabel.id),
      workspaceId: this.toId(plainLabel.workspaceId),
      name: plainLabel.name,
      createdBy: this.toId(plainLabel.createdBy),
      isDeleted: plainLabel.isDeleted || false,
      createdAt: plainLabel.createdAt,
      updatedAt: plainLabel.updatedAt,
    };
  }

  mapToDtos(labels: Array<LabelDocument | any>): LabelDto[] {
    return labels.map(label => this.mapToDto(label));
  }

  private toId(value: any): string {
    if (!value) {
      return '';
    }
    if (value._id) {
      return value._id.toString();
    }
    return value.toString();
  }
}
