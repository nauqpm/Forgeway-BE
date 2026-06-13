export interface WorkspaceSampleAvatar {
  id: string;
  publicId: string;
  url: string;
}

export const WORKSPACE_SAMPLE_AVATAR_FOLDER = 'sdlc-platform/sample avater workspace';

const cloudName = 'sdlcplatform';
const encodedFolder = WORKSPACE_SAMPLE_AVATAR_FOLDER.replace(/ /g, '%20');
const avatarIds = [
  'viewavatar',
  'viewavatar-1',
  'viewavatar-2',
  'viewavatar-3',
  'viewavatar-4',
  'viewavatar-5',
  'viewavatar-6',
  'viewavatar-8',
  'viewavatar-9',
  'viewavatar-10',
  'viewavatar-11',
  'viewavatar-12',
  'viewavatar-13',
  'viewavatar-14',
  'viewavatar-15',
  'viewavatar-16',
  'viewavatar-17',
  'viewavatar-18',
  'viewavatar-19',
  'viewavatar-20',
  'viewavatar-21',
  'viewavatar-22',
  'viewavatar-23',
  'viewavatar-24',
  'viewavatar-25',
] as const;

export const WORKSPACE_SAMPLE_AVATARS: WorkspaceSampleAvatar[] = avatarIds.map(id => ({
  id,
  publicId: `${WORKSPACE_SAMPLE_AVATAR_FOLDER}/${id}`,
  url: `https://res.cloudinary.com/${cloudName}/image/upload/${encodedFolder}/${id}.png`,
}));

const workspaceSampleAvatarUrls = new Set(WORKSPACE_SAMPLE_AVATARS.map(avatar => avatar.url));

export const isWorkspaceSampleAvatar = (avatar?: string | null): avatar is string =>
  Boolean(avatar && workspaceSampleAvatarUrls.has(avatar));

export const DEFAULT_WORKSPACE_AVATAR = WORKSPACE_SAMPLE_AVATARS[1].url;

export const pickRandomWorkspaceAvatar = (random: () => number = Math.random): string => {
  const index = Math.min(Math.floor(random() * WORKSPACE_SAMPLE_AVATARS.length), WORKSPACE_SAMPLE_AVATARS.length - 1);
  return WORKSPACE_SAMPLE_AVATARS[index].url;
};
