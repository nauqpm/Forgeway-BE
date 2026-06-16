import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StickerPackDocument = StickerPack & Document;

@Schema({ timestamps: true })
export class StickerPack {
  @Prop({ required: true, unique: true })
  key!: string; // vd: "mimi_cat" (trùng với tên thư mục trên Cloudinary)

  @Prop({ required: true })
  name!: string; // vd: "Mimi Cat"

  @Prop({ type: String, default: null })
  description?: string;

  @Prop({ required: true })
  bannerUrl!: string; // URL ảnh đại diện hiển thị ở tab chọn bộ sticker

  @Prop({ default: true, index: true })
  isActive!: boolean;

  @Prop({ default: 0 })
  displayOrder!: number;

  readonly _id!: Types.ObjectId;
}

export const StickerPackSchema = SchemaFactory.createForClass(StickerPack);
