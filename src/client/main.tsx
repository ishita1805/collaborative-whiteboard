import ReactDOM from 'react-dom/client';
import { WhiteboardProvider } from './context';
import { PluginSDKProvider } from './connectors/plugin-sdk';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <WhiteboardProvider>
    <PluginSDKProvider>
      <App />
    </PluginSDKProvider>
  </WhiteboardProvider>
);
