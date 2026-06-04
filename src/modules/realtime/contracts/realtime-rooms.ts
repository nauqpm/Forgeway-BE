export type WorkspaceRoom = `workspace:${string}`;
export type UserRoom = `user:${string}`;
export type TaskRoom = `task:${string}`;
export type PageRoom = `page:${string}`;
export type PresenceKey = `presence:${string}:${string}`;
export type RealtimeRoom = WorkspaceRoom | UserRoom | TaskRoom | PageRoom;

export const RoomBuilder = {
  workspace: (id: string): WorkspaceRoom => `workspace:${id}`,
  user: (id: string): UserRoom => `user:${id}`,
  task: (id: string): TaskRoom => `task:${id}`,
  page: (id: string): PageRoom => `page:${id}`,
  presence: (workspaceId: string, userId: string): PresenceKey =>
    `presence:${workspaceId}:${userId}`,
} as const;
