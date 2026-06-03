import type { TLAssetStore } from 'tldraw';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CollabKitClient = any;

/**
 * Create a tldraw asset store that uses CollabKit storage for image upload/delete.
 *
 * This integrates with tldraw v5's asset store interface so that when users
 * paste or drag images onto the canvas, they are uploaded to CollabKit's R2 storage.
 */
export function createAssetStore(client: CollabKitClient): TLAssetStore {
  return {
    async upload(asset, file) {
      try {
        const result = await client.storage.upload({ file });
        return { src: result.url };
      } catch (err) {
        console.error('[images] Failed to upload asset:', err);
        throw err;
      }
    },

    resolve(asset) {
      return asset.props.src ?? '';
    },
  };
}

/**
 * Delete an asset from CollabKit storage by its key.
 */
export async function deleteAsset(
  client: CollabKitClient,
  key: string
): Promise<void> {
  try {
    await client.storage.delete({ key });
  } catch (err) {
    console.error('[images] Failed to delete asset:', err);
  }
}
