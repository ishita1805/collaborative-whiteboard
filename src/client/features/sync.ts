import type { Editor, TLStore, TLRecord } from 'tldraw';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

/**
 * Encode a tldraw record ID for use as a CollabKit store key.
 * tldraw IDs contain colons (e.g., "shape:abc123") which may be invalid as store keys.
 */
function encodeKey(id: string): string {
  return id.replace(/:/g, '__');
}

/**
 * Decode a CollabKit store key back to a tldraw record ID.
 */
function decodeKey(key: string): string {
  return key.replace(/__/g, ':');
}

/**
 * Load all existing records from the CollabKit document store into the tldraw store.
 *
 * Each entry in the CollabKit store is a single tldraw record (shape, binding, asset, page).
 * Key = encoded record ID, value = { data: JSON.stringify(record) }.
 */
export function loadExistingRecords(
  store: TLStore,
  allEntries: Record<string, { data: string }>
): void {
  const records: TLRecord[] = [];

  for (const [, value] of Object.entries(allEntries)) {
    try {
      const record = JSON.parse(value.data) as TLRecord;
      if (record && record.id) {
        records.push(record);
      }
    } catch (err) {
      console.error('[sync] Failed to parse stored record:', err);
    }
  }

  if (records.length > 0) {
    store.mergeRemoteChanges(() => {
      store.put(records);
    });
  }
}

/**
 * Attach outbound sync: local tldraw changes -> CollabKit document store.
 *
 * Uses a two-layer approach with a debounced safety net:
 * 1. store.listen() accumulates all intermediate changes (every point in a stroke, every pixel of a drag)
 * 2. editor.sideEffects.registerOperationCompleteHandler() flushes accumulated changes to CollabKit
 *    once per completed operation (e.g., once after a full stroke finishes, once after a shape is moved)
 * 3. A 500ms debounced timer in store.listen() acts as a safety net for cases where
 *    operationComplete fires before the listen callback (due to tldraw's requestAnimationFrame
 *    throttling of store listeners). This ensures one-shot operations like select-all + delete
 *    are always flushed.
 *
 * This avoids flooding CollabKit with hundreds of messages per second during freehand drawing.
 * Only the final state of each record is sent per operation.
 *
 * Returns a cleanup function.
 */
export function attachOutboundSync(
  editor: Editor,
  store: TLStore,
  client: CollabKitClient
): () => void {
  // Accumulators: track the latest state of each record changed since last flush
  const pendingUpserts = new Map<string, TLRecord>();
  const pendingRemovals = new Set<string>();
  let flushTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Shared flush logic used by both operationComplete and the debounce timer
  function flush(): void {
    if (pendingUpserts.size === 0 && pendingRemovals.size === 0) return;

    // Cancel the debounce timer since we're flushing now
    if (flushTimeoutId !== null) {
      clearTimeout(flushTimeoutId);
      flushTimeoutId = null;
    }

    // Send all pending upserts
    for (const [id, record] of pendingUpserts) {
      client.stores.document
        .set({ key: encodeKey(id), value: { data: JSON.stringify(record) } })
        .catch((err: Error) => console.error('[sync:out] set failed:', id, err));
    }

    // Send all pending removals
    for (const id of pendingRemovals) {
      client.stores.document
        .delete({ key: encodeKey(id) })
        .catch((err: Error) => console.error('[sync:out] delete failed:', id, err));
    }

    // Clear accumulators
    pendingUpserts.clear();
    pendingRemovals.clear();
  }

  // Layer 1: Accumulate all changes from the store
  const unsubStore = store.listen(
    (entry) => {
      const { added, updated, removed } = entry.changes;

      for (const record of Object.values(added)) {
        pendingRemovals.delete(record.id);
        pendingUpserts.set(record.id, record);
      }

      for (const [, to] of Object.values(updated) as [TLRecord, TLRecord][]) {
        pendingUpserts.set(to.id, to);
      }

      for (const id of Object.keys(removed)) {
        pendingUpserts.delete(id);
        pendingRemovals.add(id);
      }

      // Reset the debounce timer on every change. This ensures that if
      // operationComplete fires before this listener (due to tldraw's
      // requestAnimationFrame throttling), the pending changes still get
      // flushed after 500ms of inactivity. For continuous operations like
      // freehand drawing, the timer keeps resetting so no mid-stroke flush.
      if (flushTimeoutId !== null) clearTimeout(flushTimeoutId);
      flushTimeoutId = setTimeout(flush, 500);
    },
    { source: 'user', scope: 'document' }
  );

  // Layer 2: Flush to CollabKit when an operation completes
  const unsubComplete = editor.sideEffects.registerOperationCompleteHandler(
    (source) => {
      if (source !== 'user') return;
      flush();
    }
  );

  return () => {
    unsubStore();
    unsubComplete();
    if (flushTimeoutId !== null) clearTimeout(flushTimeoutId);
  };
}

/**
 * Attach inbound sync: CollabKit document store changes -> tldraw store.
 *
 * The on('changed') event only fires for changes made by OTHER clients.
 *
 * Returns a cleanup function.
 */
export function attachInboundSync(
  store: TLStore,
  client: CollabKitClient
): () => void {
  return client.stores.document.on(
    'changed',
    (event: { key: string; action: 'set' | 'update' | 'delete'; value: { data: string } | null }) => {
      try {
        const recordId = decodeKey(event.key);

        if (event.action === 'delete' || !event.value) {
          store.mergeRemoteChanges(() => {
            store.remove([recordId as TLRecord['id']]);
          });
          return;
        }

        const record = JSON.parse(event.value.data) as TLRecord;
        if (record && record.id) {
          store.mergeRemoteChanges(() => {
            store.put([record]);
          });
        }
      } catch (err) {
        console.error('[sync:in] Failed to apply remote change:', err);
      }
    }
  );
}
