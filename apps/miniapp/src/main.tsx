import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/App';
import { telegram } from '@/telegram';
import '@/index.css';

void telegram.init();
const root = document.getElementById('root');
if (!root) throw new Error('Missing app root.');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.hot) import.meta.hot.dispose(() => telegram.destroy());
