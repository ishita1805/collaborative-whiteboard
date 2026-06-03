export type TldrawTool =
  | 'select'
  | 'hand'
  | 'draw'
  | 'eraser'
  | 'text'
  | 'note'
  | 'laser'
  | 'highlight'
  | 'geo';

export interface WhiteboardConfig {
  role: 'editor' | 'viewer';
  canvas: {
    autoScale: boolean;
    infinite: boolean;
    bounds: {
      width: number;
      height: number;
    };
  };
  tools: {
    defaultSelected: TldrawTool;
    lockTools: boolean;
  };
  settings: {
    zen: boolean;
    theme: 'dark' | 'light';
  };
}

export const defaultConfig: WhiteboardConfig = {
  role: 'editor',
  canvas: {
    autoScale: true,
    infinite: true,
    bounds: { width: 1920, height: 1080 },
  },
  tools: {
    defaultSelected: 'draw',
    lockTools: true,
  },
  settings: {
    zen: false,
    theme: 'light'
  },
};
