import type { Editor } from 'tldraw';
import type { WhiteboardConfig } from '../config';

/**
 * Initialize the tldraw editor with config-driven settings.
 * Called once when the editor mounts.
 */
export function initializeCanvas(editor: Editor, config: WhiteboardConfig): void {
  // Set readonly mode for viewers
  if (config.role === 'viewer') {
    editor.updateInstanceState({ isReadonly: true });
  }

  // Set tool lock
  editor.updateInstanceState({ isToolLocked: config.tools.lockTools });

  // Set default tool
  editor.setCurrentTool(config.tools.defaultSelected);

  // Zoom to fit content, but don't zoom in past 100%
  editor.zoomToFit();
  if (editor.getCamera().z > 1) {
    editor.setCamera({ ...editor.getCamera(), z: 1 });
  }
}
