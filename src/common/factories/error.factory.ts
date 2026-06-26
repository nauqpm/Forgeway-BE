import {
  AUTH_ERROR_CODES,
  KANBAN_ERROR_CODES,
  SPRINT_ERROR_CODES,
  TASK_ERROR_CODES,
  USER_ERROR_CODES,
  WORKSPACE_ERROR_CODES,
} from '../constants/error-codes.constants';

export interface ErrorPayload {
  message: string;
  code: string;
  details?: Record<string, unknown>;
}

export class ErrorFactory {
  // ─── Auth ───────────────────────────────────────────────────────────────
  static publicLoginFailure(retryAfterSeconds = 0): ErrorPayload {
    const payload: ErrorPayload = {
      message: 'Email or password is incorrect.',
      code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    };

    if (retryAfterSeconds > 0) {
      payload.details = this.loginRetryDetails(retryAfterSeconds);
    }

    return payload;
  }

  static loginRetryLater(retryAfterSeconds: number): ErrorPayload {
    return {
      message: 'Please wait before trying again.',
      code: AUTH_ERROR_CODES.LOGIN_RETRY_LATER,
      details: this.loginRetryDetails(retryAfterSeconds),
    };
  }

  private static loginRetryDetails(
    retryAfterSeconds: number,
  ): Record<string, unknown> {
    return {
      retryAfterSeconds,
      retryAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString(),
    };
  }

  static emailNotVerified(): ErrorPayload {
    return {
      message: 'Please verify your email before signing in.',
      code: AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED,
    };
  }

  static accountSuspended(): ErrorPayload {
    return {
      message: 'Account has been locked or suspended.',
      code: AUTH_ERROR_CODES.USER_SUSPENDED,
    };
  }

  static accountDeactivated(): ErrorPayload {
    return {
      message: 'Account has been locked or suspended.',
      code: AUTH_ERROR_CODES.USER_DEACTIVATED,
    };
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────
  static taskNotFound(id?: string): ErrorPayload {
    return {
      message: id ? `Task with ID "${id}" not found` : 'Task not found',
      code: TASK_ERROR_CODES.TASK_NOT_FOUND,
    };
  }

  static taskArchived(): ErrorPayload {
    return {
      message: 'Archived task operations are read-only.',
      code: TASK_ERROR_CODES.TASK_ARCHIVED,
    };
  }

  static taskKeyConflict(key: string): ErrorPayload {
    return {
      message: `Task key "${key}" conflicts with an existing task.`,
      code: TASK_ERROR_CODES.TASK_KEY_CONFLICT,
    };
  }

  // ─── Scrum / Sprint ─────────────────────────────────────────────────────
  static sprintNotFound(id?: string): ErrorPayload {
    return {
      message: id ? `Sprint with ID "${id}" not found` : 'Sprint not found',
      code: SPRINT_ERROR_CODES.SPRINT_NOT_FOUND,
    };
  }

  static sprintInvalidStatus(expected: string, actual: string): ErrorPayload {
    return {
      message: `Sprint must be in "${expected}" status, but current status is "${actual}".`,
      code: SPRINT_ERROR_CODES.SPRINT_INVALID_STATUS,
    };
  }

  static activeSprintExists(): ErrorPayload {
    return {
      message:
        'Cannot start sprint: There is already an active sprint in this workspace.',
      code: SPRINT_ERROR_CODES.ACTIVE_SPRINT_EXISTS,
    };
  }

  static sprintTargetInvalid(): ErrorPayload {
    return {
      message:
        'Target sprint must exist, belong to the same workspace, and be in planning status.',
      code: SPRINT_ERROR_CODES.SPRINT_TARGET_INVALID,
    };
  }

  static invalidIdFormat(resourceName: string): ErrorPayload {
    return {
      message: `ID format ${resourceName} is invalid`,
      code: SPRINT_ERROR_CODES.INVALID_ID_FORMAT,
    };
  }

  // ─── Kanban ──────────────────────────────────────────────────────────────
  static invalidColumnName(): ErrorPayload {
    return {
      message: 'Column name must not be empty.',
      code: KANBAN_ERROR_CODES.INVALID_COLUMN_NAME,
    };
  }

  static duplicateColumnName(): ErrorPayload {
    return {
      message: 'A column with this name already exists.',
      code: KANBAN_ERROR_CODES.DUPLICATE_COLUMN_NAME,
    };
  }

  // ─── Workspace ──────────────────────────────────────────────────────────
  static workspaceNotFound(id?: string): ErrorPayload {
    return {
      message: id
        ? `Workspace with ID "${id}" not found`
        : 'Workspace not found',
      code: WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND,
    };
  }

  static workspaceMemberNotFound(userId?: string): ErrorPayload {
    return {
      message: userId
        ? `User "${userId}" is not a member`
        : 'User is not a member',
      code: WORKSPACE_ERROR_CODES.WORKSPACE_MEMBER_NOT_FOUND,
    };
  }

  static workspaceKeyConflict(): ErrorPayload {
    return {
      message: 'Unable to generate unique workspace key.',
      code: WORKSPACE_ERROR_CODES.WORKSPACE_KEY_CONFLICT,
    };
  }

  static cannotRemoveOwner(): ErrorPayload {
    return {
      message: 'Cannot remove workspace owner.',
      code: WORKSPACE_ERROR_CODES.CANNOT_REMOVE_OWNER,
    };
  }

  static cannotChangeOwnerRole(): ErrorPayload {
    return {
      message: 'Cannot change owner role.',
      code: WORKSPACE_ERROR_CODES.CANNOT_CHANGE_OWNER_ROLE,
    };
  }

  static inviteNotFound(): ErrorPayload {
    return {
      message: 'Invite not found.',
      code: WORKSPACE_ERROR_CODES.INVITE_NOT_FOUND,
    };
  }

  static inviteAlreadyAccepted(): ErrorPayload {
    return {
      message: 'This invitation has already been accepted.',
      code: WORKSPACE_ERROR_CODES.INVITE_ACCEPTED,
    };
  }

  static inviteAlreadyDeclined(): ErrorPayload {
    return {
      message: 'This invitation has already been declined.',
      code: WORKSPACE_ERROR_CODES.INVITE_DECLINED,
    };
  }

  static inviteUnavailable(): ErrorPayload {
    return {
      message: 'This invitation is no longer available.',
      code: WORKSPACE_ERROR_CODES.INVITE_UNAVAILABLE,
    };
  }

  static inviteExpired(): ErrorPayload {
    return {
      message: 'This invitation has expired.',
      code: WORKSPACE_ERROR_CODES.INVITE_EXPIRED,
    };
  }

  static memberAlreadyExists(): ErrorPayload {
    return {
      message: 'You are already a member of this workspace.',
      code: WORKSPACE_ERROR_CODES.MEMBER_ALREADY_EXISTS,
    };
  }

  static inviteAlreadyPending(): ErrorPayload {
    return {
      message: 'Invite already pending for this email.',
      code: WORKSPACE_ERROR_CODES.INVITE_ALREADY_PENDING,
    };
  }

  static inviteWorkspaceMismatch(): ErrorPayload {
    return {
      message: 'Invite does not belong to this workspace.',
      code: WORKSPACE_ERROR_CODES.INVITE_WORKSPACE_MISMATCH,
    };
  }

  static frontendUrlNotConfigured(): ErrorPayload {
    return {
      message: 'FRONTEND_URL is not configured.',
      code: WORKSPACE_ERROR_CODES.FRONTEND_URL_NOT_CONFIGURED,
    };
  }

  // ─── User ───────────────────────────────────────────────────────────────
  static userNotFound(id?: string): ErrorPayload {
    return {
      message: id ? `User with ID "${id}" not found` : 'User not found',
      code: USER_ERROR_CODES.USER_NOT_FOUND,
    };
  }

  static invalidUserId(): ErrorPayload {
    return {
      message: 'Invalid user ID format.',
      code: USER_ERROR_CODES.INVALID_USER_ID,
    };
  }

  static currentPasswordIncorrect(): ErrorPayload {
    return {
      message: 'Current password is incorrect.',
      code: USER_ERROR_CODES.CURRENT_PASSWORD_INCORRECT,
    };
  }

  static passwordHasWhitespace(): ErrorPayload {
    return {
      message: 'Password must not contain leading or trailing whitespace.',
      code: USER_ERROR_CODES.PASSWORD_HAS_WHITESPACE,
    };
  }
}
