import React from 'react';
import { createRoot } from 'react-dom/client';
import RiffLabApp from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RiffLabApp />
  </React.StrictMode>
);
