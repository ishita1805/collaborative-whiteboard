import type { Editor } from 'tldraw';
import { InstancePresenceRecordType } from 'tldraw';
import { react } from '@tldraw/state';
import type { PresenceState } from '@collab-kit/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

interface TldrawPresenceMeta {
  camera: { x: number; y: number; z: number };
  currentPageId: string;
  selectedShapeIds: string[];
  userName: string;
  userColor: string;
}

/**
 * Initialize cursor and camera presence sync.
 * Returns a cleanup function.
 */
export function initPresence(
  editor: Editor,
  client: CollabKitClient,
  userName: string,
  userColor: string,
  userColorMap: Map<string, string>,
  onColorUpdated?: () => void,
): () => void {
  const cleanups: Array<() => void> = [];
  const remotePresenceIds = new Map<string, string>();
  const userId = client.currentUser?.id || client.userId;

  // --- Outbound: tldraw presence -> CollabKit ---
  // Use react() from @tldraw/state to create a reactive effect that automatically
  // re-runs whenever any read signal changes (pointer position, camera, selection, page).
  // editor.inputs.currentPagePoint is a reactive atom — editor.store.listen does NOT
  // fire for it since pointer moves don't produce 'presence'-scoped store records.
  let lastPresenceUpdate = 0;
  const PRESENCE_THROTTLE_MS = 50;

  const stopReacting = react('outbound-presence', () => {
    try {
      // Read all reactive values first so they are tracked as dependencies,
      // even if we skip the network call due to throttling.
      const pointer = editor.inputs.currentPagePoint;
      const camera = editor.getCamera();
      const currentPageId = editor.getCurrentPageId();
      const selectedShapeIds = editor.getSelectedShapeIds();

      const now = Date.now();
      if (now - lastPresenceUpdate < PRESENCE_THROTTLE_MS) return;
      lastPresenceUpdate = now;

      client.presence.update({
        cursor: {
          x: pointer?.x ?? 0,
          y: pointer?.y ?? 0,
          state: 'idle',
        },
        screen: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        meta: {
          camera: { x: camera.x, y: camera.y, z: camera.z },
          currentPageId,
          selectedShapeIds,
          userName,
          userColor,
        } satisfies TldrawPresenceMeta,
      });
    } catch (err) {
      console.error('[presence:out] update failed:', err);
    }
  });
  cleanups.push(stopReacting);

  // --- Inbound: CollabKit presence -> tldraw InstancePresenceRecords ---
  try {
    client.presence.sync(
      '*',
      ({ userId: remoteUserId, state }: { userId: string; state: PresenceState | null }) => {
        if (remoteUserId === userId) return;

        if (state === null) {
          const presenceId = remotePresenceIds.get(remoteUserId);
          if (presenceId) {
            try {
              editor.store.remove([presenceId as ReturnType<typeof InstancePresenceRecordType.createId>]);
            } catch { /* record may already be gone */ }
            remotePresenceIds.delete(remoteUserId);
          }
          userColorMap.delete(remoteUserId);
          return;
        }

        try {
          const meta = (state.meta ?? {}) as Partial<TldrawPresenceMeta>;

          // Store the CollabKit-assigned color so user tiles can match cursor color
          if (state.color) {
            userColorMap.set(remoteUserId, state.color);
            onColorUpdated?.();
          }

          const presenceId =
            remotePresenceIds.get(remoteUserId) ||
            InstancePresenceRecordType.createId(remoteUserId);

          if (!remotePresenceIds.has(remoteUserId)) {
            remotePresenceIds.set(remoteUserId, presenceId);
          }

          const presenceRecord = InstancePresenceRecordType.create({
            id: presenceId as ReturnType<typeof InstancePresenceRecordType.createId>,
            userId: remoteUserId,
            userName: meta.userName || 'Participant',
            color: state.color || '#aaaaaa',
            currentPageId: (meta.currentPageId || editor.getCurrentPageId()) as ReturnType<typeof editor.getCurrentPageId>,
            cursor: {
              x: state.cursor?.x ?? 0,
              y: state.cursor?.y ?? 0,
              type: 'default',
              rotation: 0,
            },
            selectedShapeIds: (meta.selectedShapeIds || []) as ReturnType<typeof editor.getSelectedShapeIds>,
            camera: meta.camera ?? { x: 0, y: 0, z: 1 },
            screenBounds: {
              x: 0,
              y: 0,
              w: state.screen?.width ?? 1920,
              h: state.screen?.height ?? 1080,
            },
            lastActivityTimestamp: Date.now(),
            chatMessage: '',
            brush: null,
            scribbles: [],
            followingUserId: null,
            meta: {},
          });

          editor.store.mergeRemoteChanges(() => {
            editor.store.put([presenceRecord]);
          });
        } catch (err) {
          console.error('[presence:in] Failed to apply remote presence:', err);
        }
      }
    );
  } catch (err) {
    console.error('[presence] Failed to set up presence sync:', err);
  }

  return () => {
    cleanups.forEach((fn) => fn());
    try { client.presence.unsync(); } catch { /* already disconnected */ }
  };
}
