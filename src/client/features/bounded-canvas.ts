import type { Editor } from 'tldraw';

/**
 * Compute the minimum zoom level at which the full bounds fit inside the viewport.
 */
export function getMinZoom(
  editor: Editor,
  bounds: { width: number; height: number },
): number {
  const vp = editor.getViewportScreenBounds();
  return Math.min(vp.w / bounds.width, vp.h / bounds.height);
}

/**
 * Enforce camera bounds when infinite canvas is disabled.
 *
 * Uses fixed config-defined dimensions so that every user (desktop, mobile, etc.)
 * shares the same bounded canvas area regardless of their viewport size.
 *
 * Constrains the camera so that:
 * - Zoom cannot go below minZoom (where the full bounds fit in the viewport).
 * - On any axis where the full bounds fit in the viewport, panning is locked
 *   and the bounds are centered.
 * - On any axis where the bounds exceed the viewport, panning is allowed
 *   but constrained so the camera cannot reveal space outside the bounds.
 *
 * Should be called on each camera change (e.g., in a store listener or tick handler).
 */
export function enforceCameraBounds(
  editor: Editor,
  bounds: { width: number; height: number },
): void {
  const camera = editor.getCamera();
  const minZoom = getMinZoom(editor, bounds);
  const zoom = Math.max(camera.z, minZoom);

  // How much of the page is visible at this zoom level
  const vp = editor.getViewportScreenBounds();
  const visibleW = vp.w / zoom;
  const visibleH = vp.h / zoom;

  let cx: number;
  let cy: number;

  // X axis: if full bounds fit horizontally, center; otherwise allow constrained panning
  if (visibleW >= bounds.width) {
    cx = (visibleW - bounds.width) / 2;
  } else {
    cx = Math.min(0, Math.max(-(bounds.width - visibleW), camera.x));
  }

  // Y axis: if full bounds fit vertically, center; otherwise allow constrained panning
  if (visibleH >= bounds.height) {
    cy = (visibleH - bounds.height) / 2;
  } else {
    cy = Math.min(0, Math.max(-(bounds.height - visibleH), camera.y));
  }

  // Only update if the camera needs correction
  if (cx !== camera.x || cy !== camera.y || zoom !== camera.z) {
    editor.setCamera({ x: cx, y: cy, z: zoom });
  }

  // Keep selected shapes within the fixed bounds
  keepSelectedShapesInBounds(editor, bounds);
}

/**
 * If any selected shapes extend beyond the fixed canvas bounds, snap them back inside.
 */
function keepSelectedShapesInBounds(
  editor: Editor,
  bounds: { width: number; height: number },
): void {
  const selectedShapeIds = editor.getSelectedShapeIds();
  if (selectedShapeIds.length === 0) return;

  const selectionBounds = editor.getSelectionPageBounds();
  if (!selectionBounds) return;

  // Fixed canvas bounds: origin at (0, 0), extending to (width, height)
  const minX = 0;
  const minY = 0;
  const maxX = bounds.width;
  const maxY = bounds.height;

  // Calculate overlap -- how far the selection extends beyond the fixed bounds
  const ox =
    Math.min(selectionBounds.minX - minX, 0) ||
    Math.max(selectionBounds.maxX - maxX, 0);
  const oy =
    Math.min(selectionBounds.minY - minY, 0) ||
    Math.max(selectionBounds.maxY - maxY, 0);

  if (ox !== 0 || oy !== 0) {
    const shapes = selectedShapeIds.map((id) => editor.getShape(id)).filter(Boolean);

    editor.run(() => {
      editor.updateShapes(
        shapes.map((shape) => ({
          id: shape!.id,
          type: shape!.type,
          x: shape!.x - ox,
          y: shape!.y - oy,
        }))
      );
    }, { history: 'ignore' });
  }
}
