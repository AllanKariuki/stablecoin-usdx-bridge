import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from '@damp/web-shared/layout';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot>
      <App />
    </AppRoot>
  </StrictMode>,
);
