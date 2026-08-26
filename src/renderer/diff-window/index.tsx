import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import { DiffWindowApp } from './DiffWindowApp';

const root = document.getElementById('root');
if (!root) throw new Error('Missing diff window root');

document.documentElement.dataset.runtime = window.grafter ? 'electron' : 'preview';

createRoot(root).render(
  <StrictMode>
    <DiffWindowApp />
  </StrictMode>,
);
