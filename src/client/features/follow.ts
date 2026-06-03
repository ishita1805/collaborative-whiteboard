import type { Editor } from 'tldraw';
import type { PresenceState } from '@collab-kit/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

/**
 * Initialize follow mode.
 * Returns follow/unfollow controls and a cleanup function.
 */
export function initFollow(
  editor: Editor,
  client: CollabKitClient,
  callbacks: {
    onFollowChanged: (followingUserId: string | null) => void;
  }
): {
  follow: (userId: string) => Promise<void>;
  unfollow: () => Promise<void>;
  restoreFollow: (userId: string) => void;
  cleanup: () => void;
} {
  let isFollowing = false;

  try {
    client.presence.sync(
      'following',
      ({ state }: { userId: string; state: PresenceState | null }) => {
        if (!isFollowing || !state) return;

        try {
          const meta = (state.meta ?? {}) as {
            camera?: { x: number; y: number; z: number };
          };
          const camera = meta.camera;
          if (!camera) return;

          const screenWidth = state.screen?.width ?? window.innerWidth;
          const screenHeight = state.screen?.height ?? window.innerHeight;
          const myWidth = window.innerWidth;
          const myHeight = window.innerHeight;

          const wRatio = screenWidth / myWidth;
          const hRatio = screenHeight / myHeight;
          const maxRatio = Math.max(wRatio, hRatio);

          if (maxRatio > 1) {
            const adjustedZoom = camera.z / maxRatio;
            editor.setCamera({
              x: camera.x / maxRatio,
              y: camera.y / maxRatio,
              z: adjustedZoom,
            });
          } else {
            editor.setCamera({ x: camera.x, y: camera.y, z: camera.z });
          }
        } catch (err) {
          console.error('[follow] Failed to apply followed user camera:', err);
        }
      }
    );
  } catch (err) {
    console.error('[follow] Failed to set up follow presence sync:', err);
  }

  const follow = async (userId: string): Promise<void> => {
    try {
      // unfollow();
      const targetUser = client.users.all.get(userId);
      if (!targetUser) throw new Error('User not found');
      await targetUser.follow();
      console.log(targetUser);
      isFollowing = true;
      callbacks.onFollowChanged(userId);
    } catch (err) {
      console.error('[follow] Failed to follow user:', err);
      throw err;
    }
  };

  const unfollow = async (): Promise<void> => {
    try {
      for (const [, user] of client.users.all) {
        if (user.followers?.includes(client.userId)) {
          await user.unfollow();
          break;
        }
      }
      isFollowing = false;
      callbacks.onFollowChanged(null);
    } catch (err) {
      console.error('[follow] Failed to unfollow:', err);
    }
  };

  const restoreFollow = (userId: string): void => {
    isFollowing = true;
    callbacks.onFollowChanged(userId);
  };

  return { follow, unfollow, restoreFollow, cleanup: () => { isFollowing = false; } };
}
