import React, { createContext, useContext, useState } from 'react';
import type { WhiteboardConfig } from '../config';
import { defaultConfig } from '../config';

export type WhiteboardStatus = 'connecting' | 'ready' | 'error';

interface WhiteboardContextValue {
  config: WhiteboardConfig;
  status: WhiteboardStatus;
  setStatus: (status: WhiteboardStatus) => void;
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
  const config = defaultConfig;
  const [status, setStatus] = useState<WhiteboardStatus>('connecting');
  const [error, setError] = useState<string>('');

  return (
    <WhiteboardContext.Provider value={{ config, status, setStatus, error, setError }}>
      {children}
    </WhiteboardContext.Provider>
  );
}
