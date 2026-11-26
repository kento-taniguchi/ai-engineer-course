import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import './index.css';
import { rememberLaunchIntent } from './lib/launch.ts';

// LINE のリンク（?open=...）から開いたとき、最初に見せる画面を覚えておく
rememberLaunchIntent();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(session) => <App session={session} />}</AuthGate>
  </StrictMode>
);
