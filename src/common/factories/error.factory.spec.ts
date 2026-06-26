import { ErrorFactory } from './error.factory';
import {
  AUTH_ERROR_CODES,
  TASK_ERROR_CODES,
  SPRINT_ERROR_CODES,
  WORKSPACE_ERROR_CODES,
  USER_ERROR_CODES,
} from '../constants/error-codes.constants';

describe('ErrorFactory', () => {
  describe('Auth errors', () => {
    it('publicLoginFailure() returns correct shape', () => {
      const result = ErrorFactory.publicLoginFailure();
      expect(result).toEqual({
        message: 'Email or password is incorrect.',
        code: AUTH_ERROR_CODES.INVALID_CREDENTIALS,
      });
    });

    it('publicLoginFailure() includes retry details after cooldown starts', () => {
      const result = ErrorFactory.publicLoginFailure(2);
      expect(result.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
      expect(result.details?.retryAfterSeconds).toBe(2);
      expect(result.details?.retryAt).toEqual(expect.any(String));
    });

    it('loginRetryLater() returns the progressive cooldown contract', () => {
      const result = ErrorFactory.loginRetryLater(4);
      expect(result.code).toBe(AUTH_ERROR_CODES.LOGIN_RETRY_LATER);
      expect(result.details?.retryAfterSeconds).toBe(4);
      expect(result.details?.retryAt).toEqual(expect.any(String));
    });

    it('emailNotVerified() returns correct shape', () => {
      const result = ErrorFactory.emailNotVerified();
      expect(result.message).toContain('verify your email');
      expect(result.code).toBe(AUTH_ERROR_CODES.EMAIL_NOT_VERIFIED);
    });

    it('accountSuspended() returns correct code', () => {
      const result = ErrorFactory.accountSuspended();
      expect(result.code).toBe(AUTH_ERROR_CODES.USER_SUSPENDED);
    });

    it('accountDeactivated() returns correct code', () => {
      const result = ErrorFactory.accountDeactivated();
      expect(result.code).toBe(AUTH_ERROR_CODES.USER_DEACTIVATED);
    });
  });

  describe('Task errors', () => {
    it('taskNotFound() without id', () => {
      const result = ErrorFactory.taskNotFound();
      expect(result.message).toBe('Task not found');
      expect(result.code).toBe(TASK_ERROR_CODES.TASK_NOT_FOUND);
    });

    it('taskNotFound() with id', () => {
      const result = ErrorFactory.taskNotFound('abc123');
      expect(result.message).toContain('abc123');
      expect(result.code).toBe(TASK_ERROR_CODES.TASK_NOT_FOUND);
    });

    it('taskArchived() returns correct message', () => {
      const result = ErrorFactory.taskArchived();
      expect(result.message).toContain('read-only');
      expect(result.code).toBe(TASK_ERROR_CODES.TASK_ARCHIVED);
    });

    it('taskKeyConflict() includes the key', () => {
      const result = ErrorFactory.taskKeyConflict('PROJ-42');
      expect(result.message).toContain('PROJ-42');
      expect(result.code).toBe(TASK_ERROR_CODES.TASK_KEY_CONFLICT);
    });
  });

  describe('Sprint errors', () => {
    it('sprintNotFound() without id', () => {
      const result = ErrorFactory.sprintNotFound();
      expect(result.message).toBe('Sprint not found');
      expect(result.code).toBe(SPRINT_ERROR_CODES.SPRINT_NOT_FOUND);
    });

    it('sprintNotFound() with id', () => {
      const result = ErrorFactory.sprintNotFound('sprint-1');
      expect(result.message).toContain('sprint-1');
    });

    it('sprintInvalidStatus() includes expected and actual', () => {
      const result = ErrorFactory.sprintInvalidStatus('active', 'planning');
      expect(result.message).toContain('active');
      expect(result.message).toContain('planning');
      expect(result.code).toBe(SPRINT_ERROR_CODES.SPRINT_INVALID_STATUS);
    });

    it('activeSprintExists() returns correct message', () => {
      const result = ErrorFactory.activeSprintExists();
      expect(result.message).toContain('already an active sprint');
      expect(result.code).toBe(SPRINT_ERROR_CODES.ACTIVE_SPRINT_EXISTS);
    });

    it('sprintTargetInvalid() returns correct message', () => {
      const result = ErrorFactory.sprintTargetInvalid();
      expect(result.message).toContain('Target sprint');
      expect(result.code).toBe(SPRINT_ERROR_CODES.SPRINT_TARGET_INVALID);
    });

    it('invalidIdFormat() includes resource name', () => {
      const result = ErrorFactory.invalidIdFormat('Workspace');
      expect(result.message).toContain('Workspace');
      expect(result.code).toBe(SPRINT_ERROR_CODES.INVALID_ID_FORMAT);
    });
  });

  describe('Workspace errors', () => {
    it('workspaceNotFound() without id', () => {
      const result = ErrorFactory.workspaceNotFound();
      expect(result.message).toBe('Workspace not found');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.WORKSPACE_NOT_FOUND);
    });

    it('workspaceNotFound() with id', () => {
      const result = ErrorFactory.workspaceNotFound('ws-123');
      expect(result.message).toContain('ws-123');
    });

    it('workspaceMemberNotFound() with userId', () => {
      const result = ErrorFactory.workspaceMemberNotFound('user-1');
      expect(result.message).toContain('user-1');
      expect(result.code).toBe(
        WORKSPACE_ERROR_CODES.WORKSPACE_MEMBER_NOT_FOUND,
      );
    });

    it('workspaceKeyConflict() returns correct code', () => {
      const result = ErrorFactory.workspaceKeyConflict();
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.WORKSPACE_KEY_CONFLICT);
    });

    it('cannotRemoveOwner() returns correct message', () => {
      const result = ErrorFactory.cannotRemoveOwner();
      expect(result.message).toContain('Cannot remove workspace owner');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.CANNOT_REMOVE_OWNER);
    });

    it('cannotChangeOwnerRole() returns correct message', () => {
      const result = ErrorFactory.cannotChangeOwnerRole();
      expect(result.message).toContain('Cannot change owner role');
    });

    it('inviteNotFound() returns correct code', () => {
      const result = ErrorFactory.inviteNotFound();
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_NOT_FOUND);
    });

    it('inviteAlreadyAccepted() returns correct message', () => {
      const result = ErrorFactory.inviteAlreadyAccepted();
      expect(result.message).toContain('already been accepted');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_ACCEPTED);
    });

    it('inviteAlreadyDeclined() returns correct message', () => {
      const result = ErrorFactory.inviteAlreadyDeclined();
      expect(result.message).toContain('already been declined');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_DECLINED);
    });

    it('inviteUnavailable() returns correct message', () => {
      const result = ErrorFactory.inviteUnavailable();
      expect(result.message).toContain('no longer available');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_UNAVAILABLE);
    });

    it('inviteExpired() returns correct message', () => {
      const result = ErrorFactory.inviteExpired();
      expect(result.message).toContain('expired');
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_EXPIRED);
    });

    it('memberAlreadyExists() returns correct code', () => {
      const result = ErrorFactory.memberAlreadyExists();
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.MEMBER_ALREADY_EXISTS);
    });

    it('inviteAlreadyPending() returns correct code', () => {
      const result = ErrorFactory.inviteAlreadyPending();
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_ALREADY_PENDING);
    });

    it('inviteWorkspaceMismatch() returns correct code', () => {
      const result = ErrorFactory.inviteWorkspaceMismatch();
      expect(result.code).toBe(WORKSPACE_ERROR_CODES.INVITE_WORKSPACE_MISMATCH);
    });

    it('frontendUrlNotConfigured() returns correct code', () => {
      const result = ErrorFactory.frontendUrlNotConfigured();
      expect(result.code).toBe(
        WORKSPACE_ERROR_CODES.FRONTEND_URL_NOT_CONFIGURED,
      );
    });
  });

  describe('User errors', () => {
    it('userNotFound() without id', () => {
      const result = ErrorFactory.userNotFound();
      expect(result.message).toBe('User not found');
      expect(result.code).toBe(USER_ERROR_CODES.USER_NOT_FOUND);
    });

    it('userNotFound() with id', () => {
      const result = ErrorFactory.userNotFound('usr-1');
      expect(result.message).toContain('usr-1');
    });

    it('invalidUserId() returns correct code', () => {
      const result = ErrorFactory.invalidUserId();
      expect(result.code).toBe(USER_ERROR_CODES.INVALID_USER_ID);
    });

    it('currentPasswordIncorrect() returns correct code', () => {
      const result = ErrorFactory.currentPasswordIncorrect();
      expect(result.code).toBe(USER_ERROR_CODES.CURRENT_PASSWORD_INCORRECT);
    });

    it('passwordHasWhitespace() returns correct code', () => {
      const result = ErrorFactory.passwordHasWhitespace();
      expect(result.code).toBe(USER_ERROR_CODES.PASSWORD_HAS_WHITESPACE);
    });
  });

  describe('Return shape contract', () => {
    it('all methods return an object with message (string) and code (string)', () => {
      const methods = [
        ErrorFactory.publicLoginFailure(),
        ErrorFactory.loginRetryLater(1),
        ErrorFactory.emailNotVerified(),
        ErrorFactory.accountSuspended(),
        ErrorFactory.accountDeactivated(),
        ErrorFactory.taskNotFound(),
        ErrorFactory.taskArchived(),
        ErrorFactory.taskKeyConflict('K-1'),
        ErrorFactory.sprintNotFound(),
        ErrorFactory.sprintInvalidStatus('a', 'b'),
        ErrorFactory.activeSprintExists(),
        ErrorFactory.sprintTargetInvalid(),
        ErrorFactory.invalidIdFormat('X'),
        ErrorFactory.workspaceNotFound(),
        ErrorFactory.workspaceMemberNotFound(),
        ErrorFactory.workspaceKeyConflict(),
        ErrorFactory.cannotRemoveOwner(),
        ErrorFactory.cannotChangeOwnerRole(),
        ErrorFactory.inviteNotFound(),
        ErrorFactory.inviteAlreadyAccepted(),
        ErrorFactory.inviteAlreadyDeclined(),
        ErrorFactory.inviteUnavailable(),
        ErrorFactory.inviteExpired(),
        ErrorFactory.memberAlreadyExists(),
        ErrorFactory.inviteAlreadyPending(),
        ErrorFactory.inviteWorkspaceMismatch(),
        ErrorFactory.frontendUrlNotConfigured(),
        ErrorFactory.userNotFound(),
        ErrorFactory.invalidUserId(),
        ErrorFactory.currentPasswordIncorrect(),
        ErrorFactory.passwordHasWhitespace(),
      ];

      methods.forEach(result => {
        expect(result).toHaveProperty('message');
        expect(typeof result.message).toBe('string');
        expect(result.message.length).toBeGreaterThan(0);
        expect(result).toHaveProperty('code');
        expect(typeof result.code).toBe('string');
        expect(result.code.length).toBeGreaterThan(0);
      });
    });
  });
});
