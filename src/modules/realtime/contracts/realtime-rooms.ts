export type WorkspaceRoom = `workspace:${string}`;
export type UserRoom = `user:${string}`;
export type TaskRoom = `task:${string}`;
export type PresenceKey = `presence:${string}:${string}`;
export type RealtimeRoom = WorkspaceRoom | UserRoom | TaskRoom;

export const RoomBuilder = {
  workspace: (id: string): WorkspaceRoom => `workspace:${id}`,
  user: (id: string): UserRoom => `user:${id}`,
  task: (id: string): TaskRoom => `task:${id}`,
  presence: (workspaceId: string, userId: string): PresenceKey =>
    `presence:${workspaceId}:${userId}`,
} as const;
