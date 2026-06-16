import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StickerDocument = Sticker & Document;

@Schema({ timestamps: true })
export class Sticker {
  @Prop({ type: Types.ObjectId, ref: 'StickerPack', required: true, index: true })
  packId!: Types.ObjectId;

  @Prop({ required: true, unique: true })
  code!: string; // vd: "mimi_cat_01"

  @Prop({ required: true })
  url!: string; // Cloudinary URL của sticker

  @Prop({ default: false })
  isAnimated!: boolean; // true nếu là GIF/APNG/WebP động, false nếu là ảnh tĩnh WebP/PNG

  @Prop({ type: Number, default: 120 })
  width!: number;

  @Prop({ type: Number, default: 120 })
  height!: number;

  readonly _id!: Types.ObjectId;
}

export const StickerSchema = SchemaFactory.createForClass(Sticker);
