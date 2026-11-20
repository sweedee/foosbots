import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from '@dynatrace/strato-components/core';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRoot translationRootPath={new URL('./lang/', document.baseURI).href}>
      <App />
    </AppRoot>
  </React.StrictMode>,
);
