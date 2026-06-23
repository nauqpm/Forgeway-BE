import { WorkspaceMemberJoinedEvent } from '../../../shared/events/domain-events/workspace';
import { REALTIME_EVENT_TYPES, RoomBuilder } from '../contracts';
import { RealtimePublisher } from '../publishers/realtime.publisher';
import { WorkspaceRealtimeListener } from './workspace-realtime.listener';

describe('WorkspaceRealtimeListener', () => {
  const realtimePublisher = {
    emit: jest.fn(),
  } as unknown as RealtimePublisher;

  let listener: WorkspaceRealtimeListener;

  beforeEach(() => {
    jest.clearAllMocks();
    listener = new WorkspaceRealtimeListener(realtimePublisher);
  });

  it('publishes a joined member event to workspace and member rooms', () => {
    const event = new WorkspaceMemberJoinedEvent({
      eventId: 'event-1',
      workspaceId: 'workspace-1',
      actorId: 'actor-1',
      userId: 'member-1',
      role: 'member',
    });

    listener.handleWorkspaceMemberJoined(event);

    expect(realtimePublisher.emit).toHaveBeenCalledTimes(2);
    expect(realtimePublisher.emit).toHaveBeenNthCalledWith(
      1,
      RoomBuilder.workspace('workspace-1'),
      expect.objectContaining({
        eventId: 'event-1',
        type: REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_JOINED,
        workspaceId: 'workspace-1',
        entityId: 'member-1',
      }),
    );
    expect(realtimePublisher.emit).toHaveBeenNthCalledWith(
      2,
      RoomBuilder.user('member-1'),
      expect.objectContaining({
        eventId: 'event-1',
        type: REALTIME_EVENT_TYPES.WORKSPACE_MEMBER_JOINED,
        workspaceId: 'workspace-1',
        entityId: 'member-1',
      }),
    );
  });
});
