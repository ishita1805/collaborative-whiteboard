import React, { createContext, useContext, useState } from 'react';
import type { WhiteboardConfig } from '../config';
import { defaultConfig } from '../config';

interface WhiteboardContextValue {
  config: WhiteboardConfig;
  setConfig: (config: WhiteboardConfig) => void;
  error: string;
  setError: (error: string) => void;
}

const WhiteboardContext = createContext<WhiteboardContextValue>(
  {} as WhiteboardContextValue
);

export function useWhiteboard(): WhiteboardContextValue {
  return useContext(WhiteboardContext);
}

export function WhiteboardProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<WhiteboardConfig>(defaultConfig);
  const [error, setError] = useState<string>('');

  return (
    <WhiteboardContext.Provider value={{ config, setConfig, error, setError }}>
      {children}
    </WhiteboardContext.Provider>
  );
}
