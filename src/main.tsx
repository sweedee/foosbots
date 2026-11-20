import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoot } from '@dynatrace/strato-components/core';
import { App } from './App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppRoot translationRootPath={new URL('./lang/', document.baseURI).href}>
      <ErrorBoundary label="app">
        <App />
      </ErrorBoundary>
    </AppRoot>
  </React.StrictMode>,
);
