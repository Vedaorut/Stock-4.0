import React from 'react';
import { motion } from 'framer-motion';
import PaymentMethodModal from './PaymentMethodModal';
import PaymentDetailsModal from './PaymentDetailsModal';
import PaymentHashModal from './PaymentHashModal';
import OrderStatusModal from './OrderStatusModal';
import { useStore } from '../../store/useStore';
import { t } from '../../i18n';

/**
 * Error Boundary for payment flow
 * Catches all unexpected errors and prevents app crash
 */
class PaymentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env.DEV) {
      console.error('[PaymentErrorBoundary] Error caught:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    useStore.getState().setPaymentStep('idle');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(10, 10, 10, 0.95)' }}
        >
          <div className="text-center max-w-md p-6">
            <div className="text-6xl mb-4">⚠️</div>
            <h1 className="text-white text-xl font-bold mb-2">{t('payment.errorTitle')}</h1>
            <p className="text-white/60 mb-6">{t('payment.unexpectedError')}</p>
            <motion.button
              onClick={this.handleReset}
              className="px-6 py-3 rounded-xl font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #FF8533 100%)' }}
              whileTap={{ scale: 0.95 }}
            >
              {t('common.retry')}
            </motion.button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Payment Flow Manager
 * Manages all payment modals based on paymentStep state
 */
export default function PaymentFlowManager() {
  return (
    <PaymentErrorBoundary>
      <PaymentMethodModal />
      <PaymentDetailsModal />
      <PaymentHashModal />
      <OrderStatusModal />
    </PaymentErrorBoundary>
  );
}
