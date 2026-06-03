import type { Editor } from 'tldraw';
import { InstancePresenceRecordType } from 'tldraw';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

export interface OnlineUser {
  id: string;
  name: string;
  profilePicture?: string;
  status: 'online' | 'offline';
  color?: string;
}

/**
 * Build the current online users map from CollabKit state,
 * attaching cursor colors from the shared color map.
 */
export function buildOnlineUsers(
  client: CollabKitClient,
  userColorMap: Map<string, string>,
): Map<string, OnlineUser> {
  const onlineUsers = new Map<string, OnlineUser>();
  const online = client.users?.online;
  if (online && typeof online[Symbol.iterator] === 'function') {
    for (const [id, user] of online) {
      onlineUsers.set(id, {
        id: user.id,
        name: user.name,
        profilePicture: user.profile_picture,
        status: user.status,
        color: userColorMap.get(id),
      });
    }
  }
  return onlineUsers;
}

/**
 * Initialize user lifecycle management.
 * Returns a cleanup function.
 */
export function initUsers(
  editor: Editor,
  client: CollabKitClient,
  callbacks: {
    onUsersChanged: (users: Map<string, OnlineUser>) => void;
    onUserLeft: (userId: string) => void;
  },
  userColorMap: Map<string, string>,
): () => void {
  const notifyChange = () => {
    try {
      callbacks.onUsersChanged(buildOnlineUsers(client, userColorMap));
    } catch (err) {
      console.error('[users] Failed to read online users:', err);
      callbacks.onUsersChanged(new Map());
    }
  };

  try {
    client.users.on('userJoined', () => notifyChange());

    client.users.on('userLeft', (user: { id: string }) => {
      try {
        const presenceId = InstancePresenceRecordType.createId(user.id);
        editor.store.remove([presenceId]);
      } catch { /* record may not exist */ }

      callbacks.onUserLeft(user.id);
      notifyChange();
    });
  } catch (err) {
    console.error('[users] Failed to set up user event listeners:', err);
  }

  notifyChange();

  return () => { /* CollabKit handles cleanup on disconnect */ };
}
