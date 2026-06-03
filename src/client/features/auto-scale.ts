import type { Editor } from 'tldraw';
import { MIN_ZOOM, MAX_ZOOM } from '../utils/constants';

/**
 * Apply auto-scale (zoom-to-fit) to the editor.
 *
 * Rules:
 * - Only applies when autoScale is enabled.
 * - Disabled while following another user.
 * - Disabled when the canvas is bounded (non-infinite).
 * - Clamps zoom between MIN_ZOOM (10%) and MAX_ZOOM (100%).
 */
export function applyAutoScale(
  editor: Editor,
  options: {
    autoScale: boolean;
    isFollowing: boolean;
    isBounded: boolean;
  }
): void {
  if (!options.autoScale) return;
  if (options.isBounded) return;
  if (options.isFollowing) return;

  // Don't auto-scale while the user is interacting with the canvas.
  // - isPointing: true from pointer-down to pointer-up, covers the full gesture window
  //   (isDragging alone misses the start/end edges, causing camera jumps that break
  //   drawing strokes and shape moves).
  // - isDragging: true during active drags (resize, move, draw). Belt-and-suspenders
  //   with isPointing.
  // - getEditingShapeId: non-null when editing text inline; keystrokes change the
  //   document without any pointer state, so we must suppress zoomToFit() then too.
  if (editor.inputs.isPointing || editor.inputs.isDragging) return;
  if (editor.getEditingShapeId()) return;

  editor.zoomToFit();

  // Clamp zoom to [MIN_ZOOM, MAX_ZOOM] range
  const camera = editor.getCamera();
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.z));
  if (camera.z !== clampedZoom) {
    editor.setCamera({ ...camera, z: clampedZoom });
  }
}
