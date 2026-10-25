import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './app/dictionaries.ts';
import { App } from './app/App.tsx';
import './ui/styles.css';

// Service worker (кэш оболочки и GET меню); обновляется сам при выходе новой версии.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
