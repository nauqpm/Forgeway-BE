export interface AttachmentFile {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
}

export interface CreateAttachmentInput {
  originalName: string;
  mimeType: string;
  size: number;
  targetType: 'task' | 'page';
  targetId: string;
  workspaceId?: string;
}