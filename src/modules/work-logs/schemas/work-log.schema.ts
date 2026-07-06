import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WorkLogDocument = WorkLog & Document;

/**
 * Lưu trữ từng lần Log Work riêng biệt (giống Jira Worklog).
 * Mỗi lần người dùng nhấn "Log Work" = 1 document trong collection này.
 */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class WorkLog {
  /** Workspace chứa task được log */
  @Prop({ type: Types.ObjectId, ref: 'Workspace', required: true, index: true })
  workspaceId!: Types.ObjectId;

  /** Task được log thời gian */
  @Prop({ type: Types.ObjectId, ref: 'Task', required: true, index: true })
  taskId!: Types.ObjectId;

  /** Key của task (ví dụ: AL-42) để hiển thị nhanh */
  @Prop({
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    index: true,
  })
  taskKey!: string;

  /** Người thực hiện log */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  loggedBy!: Types.ObjectId;

  /**
   * Số giờ đã làm việc trong lần log này.
   * FE gửi số thực (ví dụ 1.5).
   */
  @Prop({ type: Number, required: true, min: 0 })
  hoursSpent!: number;

  /**
   * Mô tả công việc đã làm (hỗ trợ Markdown).
   * Người dùng nhập trong Work Description Editor của Modal Log Work.
   */
  @Prop({ type: String, trim: true, maxlength: 5000 })
  description?: string;

  /**
   * Thời điểm thực tế thực hiện công việc (có thể khác với createdAt).
   * Mặc định = thời điểm tạo record nếu FE không gửi.
   */
  @Prop({ type: Date, required: true, index: true })
  loggedAt!: Date;

  readonly _id!: Types.ObjectId;
  readonly createdAt!: Date;
}

export const WorkLogSchema = SchemaFactory.createForClass(WorkLog);

WorkLogSchema.index({ workspaceId: 1, taskId: 1, loggedAt: -1 });
WorkLogSchema.index({ workspaceId: 1, loggedBy: 1, loggedAt: -1 });
WorkLogSchema.index({ workspaceId: 1, taskKey: 1, loggedAt: -1 });
