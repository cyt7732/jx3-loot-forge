import React from 'react';
import { createRoot } from 'react-dom/client';
import '../app/globals.css';
import { LootForgeApp } from './ui/LootForgeApp';

const root = document.getElementById('root');
if (!root) throw new Error('Web root element is missing.');
createRoot(root).render(
  <React.StrictMode>
    <LootForgeApp />
  </React.StrictMode>,
);