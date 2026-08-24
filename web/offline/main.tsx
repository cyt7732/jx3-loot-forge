import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import { LootForgeApp } from '../src/ui/LootForgeApp';

const root = document.getElementById('root');
if (!root) throw new Error('Offline root element is missing.');
createRoot(root).render(
  <React.StrictMode>
    <LootForgeApp />
  </React.StrictMode>,
);
