import PaymentMethodModal from './PaymentMethodModal';
import PaymentDetailsModal from './PaymentDetailsModal';
import PaymentHashModal from './PaymentHashModal';
import OrderStatusModal from './OrderStatusModal';

/**
 * Payment Flow Manager
 * Manages all payment modals based on paymentStep state
 */
export default function PaymentFlowManager() {
  return (
    <>
      <PaymentMethodModal />
      <PaymentDetailsModal />
      <PaymentHashModal />
      <OrderStatusModal />
    </>
  );
}
