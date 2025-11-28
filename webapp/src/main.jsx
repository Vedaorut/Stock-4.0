import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary';
import { TelegramProvider } from './providers/TelegramProvider';
import { enableMocking } from './mocks';

// Запуск MSW перед рендером приложения
enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <ErrorBoundary>
      <TelegramProvider>
        <App />
      </TelegramProvider>
    </ErrorBoundary>
  );
});
