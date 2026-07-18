import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');

document.documentElement.dataset.runtime = window.grafter ? 'electron' : 'preview';

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
