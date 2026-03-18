
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { runMigrations } from './services/storage/migrations';

// Run schema migrations before mounting the app.
// Idempotent: no-ops if storage is already up to date.
runMigrations();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
