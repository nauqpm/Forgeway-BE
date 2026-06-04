export type WorkspaceRoom = `workspace:${string}`;
export type UserRoom = `user:${string}`;
export type TaskRoom = `task:${string}`;
export type ChannelRoom = `channel:${string}`;
export type MeetingRoom = `meeting:${string}`;

export const RoomBuilder = {
  workspace: (id: string): WorkspaceRoom => `workspace:${id}`,
  user: (id: string): UserRoom => `user:${id}`,
  task: (id: string): TaskRoom => `task:${id}`,
  channel: (id: string): ChannelRoom => `channel:${id}`,
  meeting: (id: string): MeetingRoom => `meeting:${id}`,
} as const;
