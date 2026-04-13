import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './App';
import { initAuth } from './services/firebase';

// Initialize Firebase auth before rendering
initAuth()
  .then(() => {
    console.log('Firebase auth initialized');
  })
  .catch((err) => {
    console.error('Firebase auth failed:', err);
  });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
