import { Component } from 'react';
import { motion } from 'framer-motion'; // Used in JSX
import { t } from '../i18n';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(_error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Send error to monitoring service (e.g., Sentry)
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.showAlert(
        t('errors.errorOccurred', { message: error.message })
      );
    }
  }

  handleReload = () => {
    // Clear error state and reload
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  handleGoHome = () => {
    // Clear error and go to home page
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-bg flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md w-full text-center"
          >
            {/* Error Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              className="mb-6 flex justify-center"
            >
              <div
                className="w-20 h-20 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  boxShadow:
                    '0 4px 16px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                }}
              >
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
            </motion.div>

            {/* Error Title */}
            <h1 className="text-2xl font-bold text-white mb-3" style={{ letterSpacing: '-0.02em' }}>
              {t('errors.somethingWrong')}
            </h1>

            {/* Error Description */}
            <p className="text-gray-400 text-sm mb-2">
              {t('errors.unexpectedError')}
            </p>

            {/* Error Message (Development only) */}
            {import.meta.env.DEV && this.state.error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="my-4 p-4 rounded-xl text-left"
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                <p className="text-red-400 text-xs font-mono break-all">
                  {this.state.error.toString()}
                </p>
                {this.state.errorInfo && (
                  <details className="mt-2">
                    <summary className="text-gray-400 text-xs cursor-pointer">{t('hints.stackTrace')}</summary>
                    <pre className="text-gray-500 text-[10px] mt-2 overflow-auto max-h-32 font-mono">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </motion.div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 mt-6">
              <motion.button
                onClick={this.handleReload}
                className="w-full h-12 rounded-xl font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)',
                  boxShadow:
                    '0 4px 12px rgba(255, 107, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                }}
                whileTap={{ scale: 0.98 }}
              >
                {t('errors.reloadApp')}
              </motion.button>

              <motion.button
                onClick={this.handleGoHome}
                className="w-full h-12 rounded-xl font-semibold text-gray-300"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                }}
                whileTap={{ scale: 0.98 }}
              >
                {t('errors.goToMain')}
              </motion.button>
            </div>

            {/* Help Text */}
            <p className="text-gray-500 text-xs mt-6">
              {t('errors.persistentError')}
            </p>
          </motion.div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
