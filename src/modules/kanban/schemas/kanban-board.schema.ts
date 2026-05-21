import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardDocument = Board & Document;

@Schema()
export class BoardColumn {
  @Prop({ required: true })
  id!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  order!: number;

  @Prop()
  wipLimit?: number;

  @Prop({ type: [String], default: [] })
  mappedStatuses!: string[];
}

@Schema({ timestamps: true })
export class Board {
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  @Prop({ type: [SchemaFactory.createForClass(BoardColumn)], default: [] })
  columns!: BoardColumn[];

  @Prop({ type: String, enum: ['active', 'default', 'kanban', 'scrum'], default: 'default' })
  type!: string;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const BoardSchema = SchemaFactory.createForClass(Board);
BoardSchema.index({ workspaceId: 1 });
