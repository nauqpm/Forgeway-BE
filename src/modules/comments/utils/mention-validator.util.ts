import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { WorkspaceMemberService } from '../../workspaces/services/workspace-member.service';

/**
 * Regex to match @FullName patterns in content.
 * Supports Unicode letters (including Vietnamese characters like Nguyễn, Ả, etc.)
 * Matches @ followed by one or more words (each word is Unicode letters + hyphens/apostrophes).
 * Examples: @John, @John Doe, @Nguyễn Văn A, @Marie-Anne O'Brien
 */
const MENTION_REGEX = /@((?:\p{L}['\-\p{L}]*)+(?:\s+(?:\p{L}['\-\p{L}]*)+)*)/gu;

/**
 * Parse @FullName patterns from content text.
 * Returns an array of extracted full names (without the @ symbol).
 */
export function extractMentionedNames(content: string): string[] {
  const names: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(MENTION_REGEX.source, MENTION_REGEX.flags);
  while ((match = regex.exec(content)) !== null) {
    const name = match[1].trim();
    if (name.length > 0) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Resolve mentioned @FullName patterns from content into workspace member IDs.
 *
 * - Parses @Name from the content text.
 * - Looks up each name against workspace member fullNames (case-insensitive).
 * - Returns deduplicated ObjectId array of resolved mentions.
 * - Throws BadRequestException if any mentioned name does not match
 *   a workspace member (the mention is likely a genuine attempt to tag someone).
 *
 * This function replaces the old pattern of trusting client-provided mentions.
 * The backend now determines mentions purely from content, making it impossible
 * to bypass validation by manipulating the request payload.
 */
export async function resolveAndValidateMentions(
  workspaceMemberService: WorkspaceMemberService,
  workspaceId: string,
  content: string,
): Promise<Types.ObjectId[]> {
  const mentionedNames = extractMentionedNames(content);
  if (mentionedNames.length === 0) {
    return [];
  }

  const members = await workspaceMemberService.getMembers(workspaceId);
  if (!members || members.length === 0) {
    return [];
  }

  // Build lookup: lowercase fullName → userId string
  const nameToUserId = new Map<string, string>();
  for (const member of members) {
    const userDoc = member.userId;
    if (!userDoc) continue;
    const fullName = (userDoc.fullName || userDoc.name || '')
      .toString()
      .toLowerCase()
      .trim();
    if (fullName) {
      nameToUserId.set(fullName, (userDoc._id || userDoc).toString());
    }
  }

  const unresolved: string[] = [];
  const resolvedIds: string[] = [];

  for (const name of mentionedNames) {
    const lowerName = name.toLowerCase().trim();
    const userId = nameToUserId.get(lowerName);
    if (userId) {
      resolvedIds.push(userId);
    } else {
      unresolved.push(name);
    }
  }

  if (unresolved.length > 0) {
    throw new BadRequestException(
      `Mentioned users not found in workspace: ${unresolved.join(', ')}`,
    );
  }

  // Deduplicate and return as ObjectId array
  return [...new Set(resolvedIds)].map(id => new Types.ObjectId(id));
}

/**
 * Legacy wrapper for backward compatibility.
 * Validates mentions from the old client-provided array format.
 * @deprecated Use resolveAndValidateMentions() instead.
 */
export async function validateCommentMentions(
  workspaceMemberService: WorkspaceMemberService,
  workspaceId: string,
  mentions: string[] | undefined | null,
): Promise<void> {
  if (!mentions || mentions.length === 0) {
    return;
  }

  const nonMembers = await workspaceMemberService.filterNonMembers(
    workspaceId,
    mentions,
  );

  if (nonMembers.length > 0) {
    throw new BadRequestException(
      'Mentioned users must be members of this workspace',
    );
  }
}
