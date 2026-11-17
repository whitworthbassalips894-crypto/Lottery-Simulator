import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { AppProvider } from '../src/state';

const el = document.getElementById('root');
if (!el) throw new Error('缺少 #root');
createRoot(el).render(
  <React.StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </React.StrictMode>
);
