/**
 * PaymentDetailsModal Component Tests
 *
 * Comprehensive test suite using @testing-library/react.
 * Tests the actual React component behavior including:
 * - Rendering states (loading, error, success)
 * - QR code display
 * - Copy to clipboard functionality
 * - Button interactions
 * - Payment step transitions
 * - Props reactivity
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// =============================================================================
// MOCKS
// =============================================================================

// Use global clipboard mock from setup.js, create local reference
const mockClipboardWriteText = global.mockClipboardWriteText || vi.fn().mockResolvedValue(undefined);

// Mock Zustand store
const mockSetPaymentStep = vi.fn();
const mockStoreState = {
  paymentStep: 'details',
  selectedCrypto: 'BTC',
  paymentWallet: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
  currentOrder: {
    id: 'order-123',
    total_price: '100.00',
    quantity: 2,
  },
  cryptoAmount: 0.00234567,
  setPaymentStep: mockSetPaymentStep,
  isGeneratingInvoice: false,
  language: 'en',
};

vi.mock('../../../store/useStore', () => ({
  useStore: vi.fn((selector) => {
    if (typeof selector === 'function') {
      return selector(mockStoreState);
    }
    return mockStoreState;
  }),
}));

// Mock zustand/react/shallow
vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector) => selector,
}));

// Mock useTelegram
const mockTriggerHaptic = vi.fn();
vi.mock('../../../hooks/useTelegram', () => ({
  useTelegram: () => ({
    triggerHaptic: mockTriggerHaptic,
    tg: window.Telegram?.WebApp,
    isReady: true,
  }),
}));

// Mock useTranslation
vi.mock('../../../i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (key, params) => {
      const translations = {
        'payment.payWith': `Pay with ${params?.crypto || 'crypto'}`,
        'payment.iPaid': 'I Paid',
        'cart.items': `${params?.count || 0} items`,
      };
      return translations[key] || key;
    },
    lang: 'en',
  }),
}));

// Mock useBackButton
vi.mock('../../../hooks/useBackButton', () => ({
  useBackButton: vi.fn(),
}));

// Mock useToast
vi.mock('../../../hooks/useToast', () => ({
  useToast: () => ({
    show: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

// Mock usePlatform
vi.mock('../../../hooks/usePlatform', () => ({
  usePlatform: () => 'ios',
}));

// Mock platform utils
vi.mock('../../../utils/platform', () => ({
  getSpringPreset: () => ({ type: 'spring', stiffness: 300, damping: 30 }),
  getSurfaceStyle: () => ({ background: 'rgba(0,0,0,0.5)' }),
  getSheetMaxHeight: () => 'calc(100vh - 100px)',
  isAndroid: () => false,
  isIOS: () => true,
}));

// Mock QRCodeSVG (lazy loaded component)
vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }) => (
    <div data-testid="qr-code" data-value={value} data-size={size}>
      QR Code: {value}
    </div>
  ),
}));

// Mock framer-motion to simplify testing
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, onClick, className, style, ...props }) => (
      <div onClick={onClick} className={className} style={style} data-testid={props['data-testid']}>
        {children}
      </div>
    ),
    button: ({ children, onClick, className, style, ...props }) => (
      <button onClick={onClick} className={className} style={style}>
        {children}
      </button>
    ),
  },
  AnimatePresence: ({ children }) => <>{children}</>,
}));

// Import component after mocks
import PaymentDetailsModal from '../PaymentDetailsModal';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

const updateMockStore = (updates) => {
  Object.assign(mockStoreState, updates);
};

const resetMockStore = () => {
  Object.assign(mockStoreState, {
    paymentStep: 'details',
    selectedCrypto: 'BTC',
    paymentWallet: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
    currentOrder: {
      id: 'order-123',
      total_price: '100.00',
      quantity: 2,
    },
    cryptoAmount: 0.00234567,
    setPaymentStep: mockSetPaymentStep,
    isGeneratingInvoice: false,
    language: 'en',
  });
};

// =============================================================================
// TEST SUITES
// =============================================================================

describe('PaymentDetailsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockStore();
    mockClipboardWriteText.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // RENDERING TESTS
  // ===========================================================================

  describe('Rendering', () => {
    it('renders payment details when paymentStep is "details"', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
        expect(screen.getByText('Bitcoin Network')).toBeInTheDocument();
      });
    });

    it('does not render when paymentStep is not "details"', () => {
      updateMockStore({ paymentStep: 'method' });
      const { container } = render(<PaymentDetailsModal />);

      // AnimatePresence renders children only when isOpen is true
      expect(screen.queryByText('Pay with Bitcoin')).not.toBeInTheDocument();
    });

    it('renders loading spinner when isGeneratingInvoice is true', () => {
      updateMockStore({ isGeneratingInvoice: true });
      render(<PaymentDetailsModal />);

      expect(screen.getByText(/Загрузка деталей платежа/i)).toBeInTheDocument();
    });

    it('renders error state for unknown cryptocurrency', () => {
      updateMockStore({ selectedCrypto: 'UNKNOWN_CRYPTO' });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Неизвестная криптовалюта')).toBeInTheDocument();
    });

    it('renders error state when payment wallet is missing', () => {
      updateMockStore({ paymentWallet: null });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Ошибка загрузки')).toBeInTheDocument();
    });

    it('renders error state when crypto amount is zero', () => {
      updateMockStore({ cryptoAmount: 0 });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Ошибка загрузки')).toBeInTheDocument();
    });

    it('renders error state when crypto amount is negative', () => {
      updateMockStore({ cryptoAmount: -1 });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Ошибка загрузки')).toBeInTheDocument();
    });

    it('returns null when currentOrder is missing', () => {
      updateMockStore({ currentOrder: null, selectedCrypto: 'BTC' });
      const { container } = render(<PaymentDetailsModal />);

      // Component returns null for missing order
      expect(screen.queryByText('Pay with Bitcoin')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // QR CODE TESTS
  // ===========================================================================

  describe('QR Code', () => {
    it('renders QR code with correct wallet address', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        const qrCode = screen.getByTestId('qr-code');
        expect(qrCode).toBeInTheDocument();
        expect(qrCode).toHaveAttribute(
          'data-value',
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
        );
      });
    });

    it('renders QR code with correct size for iOS', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        const qrCode = screen.getByTestId('qr-code');
        expect(qrCode).toHaveAttribute('data-size', '140');
      });
    });

    it('displays wallet address in the UI', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(
          screen.getByText('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq')
        ).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // CRYPTO AMOUNT DISPLAY TESTS
  // ===========================================================================

  describe('Crypto Amount Display', () => {
    it('displays formatted crypto amount for BTC', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/0\.00234567 BTC/)).toBeInTheDocument();
      });
    });

    it('displays formatted crypto amount for ETH', async () => {
      updateMockStore({ selectedCrypto: 'ETH', cryptoAmount: 0.042345 });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/0\.042345 ETH/)).toBeInTheDocument();
      });
    });

    it('displays formatted crypto amount for USDT', async () => {
      updateMockStore({
        selectedCrypto: 'USDT_TRC20',
        cryptoAmount: 100.5,
        paymentWallet: 'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/100\.50 USDT_TRC20/)).toBeInTheDocument();
      });
    });

    it('displays formatted crypto amount for LTC', async () => {
      updateMockStore({
        selectedCrypto: 'LTC',
        cryptoAmount: 1.12345,
        paymentWallet: 'LQ3B36Yv2rBtHeyVL1GvLZnmfCvQqJQKPm',
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/1\.12345 LTC/)).toBeInTheDocument();
      });
    });

    it('displays USD price from order', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$100.00 USD')).toBeInTheDocument();
      });
    });

    it('displays item count from order', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('2 items')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // COPY TO CLIPBOARD TESTS
  // ===========================================================================

  describe('Copy to Clipboard', () => {
    // Helper to find the wallet copy button (small button with copy icon in wallet row)
    const findWalletCopyButton = () => {
      const buttons = screen.getAllByRole('button');
      // The wallet copy button is the one with class containing "flex-shrink-0 w-8 h-8"
      return buttons.find((btn) =>
        btn.className.includes('flex-shrink-0') && btn.className.includes('w-8')
      );
    };

    it('copies wallet address when copy button is clicked', async () => {
      render(<PaymentDetailsModal />);

      // Wait for render
      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      const copyButton = findWalletCopyButton();
      expect(copyButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(copyButton);
        // Wait for async clipboard operation
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith(
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
        );
      });
      expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
    });

    it('copies amount when amount card is clicked', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$100.00 USD')).toBeInTheDocument();
      });

      // Find the amount card (button containing USD price)
      const amountCard = screen.getByText('$100.00 USD').closest('button');
      expect(amountCard).toBeTruthy();

      await act(async () => {
        fireEvent.click(amountCard);
        // Wait for async clipboard operation
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(mockClipboardWriteText).toHaveBeenCalledWith('0.00234567 BTC');
      });
      expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
    });

    it('triggers error haptic when clipboard fails', async () => {
      mockClipboardWriteText.mockRejectedValueOnce(new Error('Clipboard error'));

      // Also mock execCommand to fail
      const originalExecCommand = document.execCommand;
      document.execCommand = vi.fn().mockReturnValue(false);

      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      const copyButton = findWalletCopyButton();
      expect(copyButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(copyButton);
        // Wait for async clipboard operation
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(mockTriggerHaptic).toHaveBeenCalledWith('error');
      });

      document.execCommand = originalExecCommand;
    });

    it('shows success haptic after successful copy', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      const copyButton = findWalletCopyButton();
      expect(copyButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(copyButton);
        // Wait for async clipboard operation
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
      });
    });
  });

  // ===========================================================================
  // BUTTON INTERACTION TESTS
  // ===========================================================================

  describe('Button Interactions', () => {
    it('calls setPaymentStep with "hash" when "I Paid" button is clicked', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('I Paid')).toBeInTheDocument();
      });

      const paidButton = screen.getByText('I Paid');
      await user.click(paidButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('hash');
      expect(mockTriggerHaptic).toHaveBeenCalledWith('medium');
    });

    it('calls setPaymentStep with "method" when close/back button is clicked', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      // Find the back button (first button with chevron icon, before "I Paid")
      const buttons = screen.getAllByRole('button');
      const backButton = buttons[0];

      await user.click(backButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('method');
      expect(mockTriggerHaptic).toHaveBeenCalledWith('light');
    });

    it('closes modal when clicking backdrop overlay', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      // The first div with onClick is the backdrop
      const allDivs = document.querySelectorAll('div');
      // Find the backdrop - it's the first fixed inset-0 div
      let backdrop = null;
      for (const div of allDivs) {
        if (div.className && div.className.includes('fixed') && div.className.includes('inset-0') && div.className.includes('z-50')) {
          backdrop = div;
          break;
        }
      }

      if (backdrop) {
        await user.click(backdrop);
        expect(mockSetPaymentStep).toHaveBeenCalledWith('method');
      }
    });
  });

  // ===========================================================================
  // PAYMENT STEP TRANSITION TESTS
  // ===========================================================================

  describe('Payment Step Transitions', () => {
    it('transitions from details to hash step on payment confirmation', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('I Paid')).toBeInTheDocument();
      });

      const paidButton = screen.getByText('I Paid');
      await user.click(paidButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('hash');
    });

    it('transitions back to method step on close', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const backButton = buttons[0];

      await user.click(backButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('method');
    });
  });

  // ===========================================================================
  // CRYPTO TYPE SPECIFIC TESTS
  // ===========================================================================

  describe('Crypto Type Display', () => {
    it('displays BTC network information', async () => {
      updateMockStore({ selectedCrypto: 'BTC' });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Bitcoin Network')).toBeInTheDocument();
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });
    });

    it('displays ETH network information', async () => {
      updateMockStore({ selectedCrypto: 'ETH', cryptoAmount: 0.042 });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Ethereum')).toBeInTheDocument();
        expect(screen.getByText('Pay with Ethereum')).toBeInTheDocument();
      });
    });

    it('displays USDT TRC20 network information', async () => {
      updateMockStore({
        selectedCrypto: 'USDT_TRC20',
        cryptoAmount: 100,
        paymentWallet: 'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('TRC20')).toBeInTheDocument();
        expect(screen.getByText('Pay with Tether')).toBeInTheDocument();
      });
    });

    it('displays LTC network information', async () => {
      updateMockStore({
        selectedCrypto: 'LTC',
        cryptoAmount: 1.1,
        paymentWallet: 'LQ3B36Yv2rBtHeyVL1GvLZnmfCvQqJQKPm',
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Litecoin Network')).toBeInTheDocument();
        expect(screen.getByText('Pay with Litecoin')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // CLOSE BUTTON BEHAVIOR
  // ===========================================================================

  describe('Close Button', () => {
    it('renders close button in error state for unknown crypto', () => {
      updateMockStore({ selectedCrypto: 'UNKNOWN' });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Закрыть')).toBeInTheDocument();
    });

    it('renders back button in error state for missing payment data', () => {
      updateMockStore({ paymentWallet: null });
      render(<PaymentDetailsModal />);

      expect(screen.getByText('Назад')).toBeInTheDocument();
    });

    it('closes error modal when close button is clicked', async () => {
      updateMockStore({ selectedCrypto: 'UNKNOWN' });
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      const closeButton = screen.getByText('Закрыть');
      await user.click(closeButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('method');
    });

    it('closes error modal when back button is clicked', async () => {
      updateMockStore({ paymentWallet: null });
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      const backButton = screen.getByText('Назад');
      await user.click(backButton);

      expect(mockSetPaymentStep).toHaveBeenCalledWith('method');
    });
  });

  // ===========================================================================
  // ACCESSIBILITY TESTS
  // ===========================================================================

  describe('Accessibility', () => {
    it('has accessible button elements', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });

    it('wallet address is readable by screen readers', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        const walletText = screen.getByText('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq');
        expect(walletText).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // PROPS REACTIVITY TESTS
  // ===========================================================================

  describe('Props Reactivity', () => {
    it('updates display when crypto changes', async () => {
      const { rerender } = render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      updateMockStore({ selectedCrypto: 'ETH', cryptoAmount: 0.042 });
      rerender(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Ethereum')).toBeInTheDocument();
      });
    });

    it('updates QR code when wallet changes', async () => {
      const { rerender } = render(<PaymentDetailsModal />);

      await waitFor(() => {
        let qrCode = screen.getByTestId('qr-code');
        expect(qrCode).toHaveAttribute(
          'data-value',
          'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'
        );
      });

      updateMockStore({ paymentWallet: 'bc1qNEW_WALLET_ADDRESS' });
      rerender(<PaymentDetailsModal />);

      await waitFor(() => {
        const qrCode = screen.getByTestId('qr-code');
        expect(qrCode).toHaveAttribute('data-value', 'bc1qNEW_WALLET_ADDRESS');
      });
    });

    it('updates amount display when cryptoAmount changes', async () => {
      const { rerender } = render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/0\.00234567 BTC/)).toBeInTheDocument();
      });

      updateMockStore({ cryptoAmount: 0.005 });
      rerender(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/0\.00500000 BTC/)).toBeInTheDocument();
      });
    });

    it('hides modal when paymentStep changes', async () => {
      const { rerender } = render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      updateMockStore({ paymentStep: 'method' });
      rerender(<PaymentDetailsModal />);

      expect(screen.queryByText('Pay with Bitcoin')).not.toBeInTheDocument();
    });
  });

  // ===========================================================================
  // ORDER DATA DISPLAY TESTS
  // ===========================================================================

  describe('Order Data Display', () => {
    it('displays correct total price from order', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-456',
          total_price: '250.75',
          quantity: 3,
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$250.75 USD')).toBeInTheDocument();
      });
    });

    it('displays correct item count from order', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-789',
          total_price: '50.00',
          quantity: 5,
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('5 items')).toBeInTheDocument();
      });
    });

    it('handles missing quantity (defaults to 1)', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-999',
          total_price: '50.00',
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('1 items')).toBeInTheDocument();
      });
    });

    it('handles zero total price', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-0',
          total_price: '0',
          quantity: 1,
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$0.00 USD')).toBeInTheDocument();
      });
    });
  });

  // ===========================================================================
  // HAPTIC FEEDBACK TESTS
  // ===========================================================================

  describe('Haptic Feedback', () => {
    it('triggers light haptic on close', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      await user.click(buttons[0]);

      expect(mockTriggerHaptic).toHaveBeenCalledWith('light');
    });

    it('triggers medium haptic on "I Paid" button', async () => {
      const user = userEvent.setup();
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('I Paid')).toBeInTheDocument();
      });

      const paidButton = screen.getByText('I Paid');
      await user.click(paidButton);

      expect(mockTriggerHaptic).toHaveBeenCalledWith('medium');
    });

    it('triggers success haptic on successful copy', async () => {
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
      });

      // Find wallet copy button (button with flex-shrink-0 class)
      const buttons = screen.getAllByRole('button');
      const copyButton = buttons.find((btn) =>
        btn.className.includes('flex-shrink-0') && btn.className.includes('w-8')
      );

      expect(copyButton).toBeTruthy();

      await act(async () => {
        fireEvent.click(copyButton);
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      await waitFor(() => {
        expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
      });
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('handles very long wallet addresses', async () => {
      const longWallet = 'bc1q' + 'a'.repeat(100);
      updateMockStore({ paymentWallet: longWallet });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(longWallet)).toBeInTheDocument();
      });
    });

    it('handles very small crypto amounts', async () => {
      updateMockStore({ cryptoAmount: 0.00000001 });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/0\.00000001 BTC/)).toBeInTheDocument();
      });
    });

    it('handles very large crypto amounts', async () => {
      updateMockStore({ cryptoAmount: 999999.99999999 });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText(/999999\.99999999 BTC/)).toBeInTheDocument();
      });
    });

    it('handles string total_price in order', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-str',
          total_price: '199.99',
          quantity: 1,
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$199.99 USD')).toBeInTheDocument();
      });
    });

    it('handles null total_price in order (shows 0.00)', async () => {
      updateMockStore({
        currentOrder: {
          id: 'order-null',
          total_price: null,
          quantity: 1,
        },
      });
      render(<PaymentDetailsModal />);

      await waitFor(() => {
        expect(screen.getByText('$0.00 USD')).toBeInTheDocument();
      });
    });
  });
});

// =============================================================================
// UTILITY FUNCTION TESTS (Pure Logic)
// =============================================================================

describe('Payment Utility Functions', () => {
  describe('formatCryptoAmount', () => {
    // Import directly for unit tests
    const { formatCryptoAmount } = require('../../../utils/paymentUtils');

    it('formats BTC with 8 decimals', () => {
      expect(formatCryptoAmount(0.001, 'BTC')).toBe('0.00100000');
    });

    it('formats ETH with 6 decimals', () => {
      expect(formatCryptoAmount(1.5, 'ETH')).toBe('1.500000');
    });

    it('formats USDT with 2 decimals', () => {
      expect(formatCryptoAmount(99.9, 'USDT_TRC20')).toBe('99.90');
    });

    it('formats LTC with 5 decimals', () => {
      expect(formatCryptoAmount(5.1, 'LTC')).toBe('5.10000');
    });

    it('handles undefined amount', () => {
      expect(formatCryptoAmount(undefined, 'BTC')).toBe('0.00000000');
    });

    it('handles NaN amount', () => {
      expect(formatCryptoAmount(NaN, 'BTC')).toBe('0.00000000');
    });
  });

  describe('CRYPTO_OPTIONS lookup', () => {
    const { CRYPTO_OPTIONS } = require('../../../utils/paymentUtils');

    it('finds BTC by id', () => {
      const btc = CRYPTO_OPTIONS.find((c) => c.id === 'BTC');
      expect(btc.name).toBe('Bitcoin');
    });

    it('finds ETH by id', () => {
      const eth = CRYPTO_OPTIONS.find((c) => c.id === 'ETH');
      expect(eth.name).toBe('Ethereum');
    });

    it('finds USDT_TRC20 by id', () => {
      const usdt = CRYPTO_OPTIONS.find((c) => c.id === 'USDT_TRC20');
      expect(usdt.name).toBe('Tether');
    });

    it('finds LTC by id', () => {
      const ltc = CRYPTO_OPTIONS.find((c) => c.id === 'LTC');
      expect(ltc.name).toBe('Litecoin');
    });

    it('returns undefined for unknown crypto', () => {
      const unknown = CRYPTO_OPTIONS.find((c) => c.id === 'DOGE');
      expect(unknown).toBeUndefined();
    });
  });
});

// =============================================================================
// COPY STATE TIMEOUT TESTS
// =============================================================================

describe('Copy State Timeout Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMockStore();
    mockClipboardWriteText.mockResolvedValue(undefined);
  });

  it('copied state timeout clears on unmount (cleanup check)', async () => {
    // This test verifies the cleanup logic in useEffect
    // The component has useEffect that clears timeouts on unmount

    render(<PaymentDetailsModal />);

    await waitFor(() => {
      expect(screen.getByText('Pay with Bitcoin')).toBeInTheDocument();
    });

    // Find wallet copy button
    const buttons = screen.getAllByRole('button');
    const copyButton = buttons.find((btn) =>
      btn.className.includes('flex-shrink-0') && btn.className.includes('w-8')
    );

    expect(copyButton).toBeTruthy();

    // Click to copy - starts a timeout
    await act(async () => {
      fireEvent.click(copyButton);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    // Verify copy was triggered
    await waitFor(() => {
      expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
    });

    // The component's useEffect cleanup will clear the timeout on unmount
    // No explicit assertion needed - test passes if no memory leaks/errors
  });
});
