import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type BoardDocument = Board & Document;

@Schema({ _id: false })
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

  @Prop({ type: Boolean, default: false })
  isDone!: boolean;
}

@Schema({ timestamps: true })
export class Board {
  @Prop({
    type: Types.ObjectId,
    ref: 'Workspace',
    required: true,
    unique: true,
  })
  workspaceId!: Types.ObjectId;

  @Prop({ type: String, trim: true, maxlength: 100 })
  name?: string;

  @Prop({
    type: {
      wipEnabled: { type: Boolean, default: false },
      swimlaneEnabled: { type: Boolean, default: false },
      estimationEnabled: { type: Boolean, default: true },
    },
    default: {},
  })
  settings!: {
    wipEnabled: boolean;
    swimlaneEnabled: boolean;
    estimationEnabled: boolean;
  };

  @Prop({ type: [SchemaFactory.createForClass(BoardColumn)], default: [] })
  columns!: BoardColumn[];

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
  readonly updatedAt!: Date;
}

export const BoardSchema = SchemaFactory.createForClass(Board);
