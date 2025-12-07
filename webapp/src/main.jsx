import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import { TelegramProvider } from './providers/TelegramProvider';
import { enableMocking } from './mocks';
import { initSentry } from './lib/sentry';

// Initialize Sentry BEFORE rendering (captures all errors)
initSentry();

// Set Telegram WebApp colors BEFORE render (fix iOS overscroll background)
const tg = window.Telegram?.WebApp;
try {
  tg?.setBackgroundColor?.('#181818');
  tg?.setHeaderColor?.('#181818');
  tg?.setBottomBarColor?.('#181818');

  // Set safe area CSS variable for header/content positioning
  const safeTop = tg?.safeAreaInset?.top ?? 0;
  document.documentElement.style.setProperty('--safe-top', `${safeTop}px`);
} catch {
  // Ignore errors if methods not available
}
tg?.ready?.();

// Start MSW before rendering the application
enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <TelegramProvider>
        <App />
      </TelegramProvider>
    </ErrorBoundary>
  );
});
