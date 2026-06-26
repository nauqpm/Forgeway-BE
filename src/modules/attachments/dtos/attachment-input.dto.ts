export interface AttachmentFile {
  filename: string;
  originalname: string;
  mimetype: string;
  size: number;
  destination?: string;
}

export interface CreateAttachmentInput {
  originalName: string;
  mimeType: string;
  size: number;
  targetType: 'task' | 'page' | 'channel';
  targetId: string;
  workspaceId?: string;
  workspaceName?: string;
  targetName?: string;
}
