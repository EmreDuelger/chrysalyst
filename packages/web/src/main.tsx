import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error(
    'Cannot mount the application: no element with id "root" was found',
  );
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
