import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import { TelegramProvider } from './providers/TelegramProvider';
import { enableMocking } from './mocks';

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
