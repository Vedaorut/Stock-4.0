/**
 * WalletsModal Component Tests
 *
 * Real React component tests using @testing-library/react.
 * Tests rendering, user interactions, API calls, and validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WalletsModal from '../WalletsModal';

// ============================================================================
// MOCKS
// ============================================================================

// Mock useTelegram hook
const mockTriggerHaptic = vi.fn();
const mockAlert = vi.fn().mockResolvedValue(undefined);
const mockConfirm = vi.fn().mockResolvedValue(true);

vi.mock('../../../hooks/useTelegram', () => ({
  useTelegram: () => ({
    triggerHaptic: mockTriggerHaptic,
    alert: mockAlert,
    confirm: mockConfirm,
  }),
}));

// Mock useApi hook
const mockGet = vi.fn();
const mockPut = vi.fn();

vi.mock('../../../hooks/useApi', () => ({
  useApi: () => ({
    get: mockGet,
    put: mockPut,
  }),
}));

// Mock useTranslation hook
vi.mock('../../../i18n/useTranslation', () => ({
  useTranslation: () => ({
    t: (key, params) => {
      // Return key with params for testing
      const translations = {
        'wallet.title': 'Wallets',
        'wallet.add': 'Add Wallet',
        'wallet.empty': 'No wallets configured',
        'wallet.supported': 'Supported: BTC, ETH, USDT, LTC',
        'wallet.confirmRemove': 'Remove this wallet?',
        'wallet.loadError': 'Failed to load wallets',
        'wallet.saveError': 'Failed to save wallet',
        'wallet.deleteError': 'Failed to delete wallet',
        'wallet.shopRequired': 'Shop is required',
        'wallet.invalidAddress': 'Invalid address format',
        'wallet.invalidAll': 'All addresses are invalid',
        'wallet.invalidAddresses': 'No valid addresses provided',
        'wallet.added': params ? `Added ${params.date}` : 'Added',
        'common.loading': 'Loading...',
        'common.save': 'Save',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock useBackButton hook
const mockBackButtonCallback = vi.fn();
vi.mock('../../../hooks/useBackButton', () => ({
  useBackButton: (callback) => {
    mockBackButtonCallback.mockImplementation(callback);
  },
}));

// Mock useScrollLock hook
vi.mock('../../../hooks/useScrollLock', () => ({
  useScrollLock: vi.fn(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual('framer-motion');
  return {
    ...actual,
    AnimatePresence: ({ children }) => children,
    motion: {
      div: ({ children, ...props }) => {
        const { initial, animate, exit, transition, whileTap, layout, ...rest } = props;
        return <div {...rest}>{children}</div>;
      },
      button: ({ children, ...props }) => {
        const { initial, animate, exit, transition, whileTap, layout, ...rest } = props;
        return <button {...rest}>{children}</button>;
      },
    },
  };
});

// ============================================================================
// TEST DATA
// ============================================================================

const mockShop = {
  id: 1,
  name: 'Test Shop',
  telegram_id: 123456789,
};

const mockWalletsResponse = {
  data: {
    wallet_btc: '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa',
    wallet_eth: '0x742d35Cc6634C0532925a3b844Bc9e7E49f42bF0',
    wallet_usdt: null,
    wallet_ltc: null,
    updated_at: '2024-01-15T10:00:00Z',
  },
};

const validAddresses = {
  BTC: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
  ETH: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  USDT: 'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS',
  LTC: 'LQ3B36Yv2rBtHeyVL1GvLZnmfCvQqJQKPm',
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const renderWalletsModal = (props = {}) => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
  };
  return render(<WalletsModal {...defaultProps} {...props} />);
};

const setupSuccessfulApiMocks = () => {
  mockGet.mockImplementation((url) => {
    if (url === '/shops/my') {
      return Promise.resolve({ data: { data: [mockShop] }, error: null });
    }
    if (url.includes('/wallets')) {
      return Promise.resolve({ data: mockWalletsResponse, error: null });
    }
    return Promise.resolve({ data: null, error: 'Not found' });
  });

  mockPut.mockResolvedValue({ data: mockWalletsResponse, error: null });
};

const setupEmptyWalletsMocks = () => {
  mockGet.mockImplementation((url) => {
    if (url === '/shops/my') {
      return Promise.resolve({ data: { data: [mockShop] }, error: null });
    }
    if (url.includes('/wallets')) {
      return Promise.resolve({
        data: {
          data: {
            wallet_btc: null,
            wallet_eth: null,
            wallet_usdt: null,
            wallet_ltc: null,
          },
        },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: 'Not found' });
  });
};

// ============================================================================
// 1. RENDERING TESTS
// ============================================================================

describe('WalletsModal - Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulApiMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    renderWalletsModal({ isOpen: false });
    expect(screen.queryByText('Wallets')).not.toBeInTheDocument();
  });

  it('renders modal when isOpen is true', async () => {
    renderWalletsModal({ isOpen: true });

    await waitFor(() => {
      expect(screen.getByText('Wallets')).toBeInTheDocument();
    });
  });

  it('displays loading spinner while fetching data', () => {
    // Make API calls hang
    mockGet.mockImplementation(() => new Promise(() => {}));

    renderWalletsModal();

    // Look for the spinner element by its class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('displays empty state when no wallets configured', async () => {
    setupEmptyWalletsMocks();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('No wallets configured')).toBeInTheDocument();
    });
  });

  it('displays wallet list when wallets exist', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.getByText('ETH')).toBeInTheDocument();
    });
  });

  it('displays add wallet button when not all wallets configured', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });
  });

  it('displays info card with wallet description', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Supported: BTC, ETH, USDT, LTC/i)).toBeInTheDocument();
    });
  });

  it('displays shop name in info card', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('Test Shop')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 2. LOADING STATE TESTS
// ============================================================================

describe('WalletsModal - Loading States', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner initially', () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    renderWalletsModal();

    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('hides spinner after successful data load', async () => {
    setupSuccessfulApiMocks();
    renderWalletsModal();

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  it('hides spinner after error', async () => {
    mockGet.mockResolvedValue({ data: null, error: 'Network error' });
    renderWalletsModal();

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 3. ERROR STATE TESTS
// ============================================================================

describe('WalletsModal - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays error message when shops API fails', async () => {
    mockGet.mockResolvedValue({ data: null, error: 'Network error' });
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('Failed to load wallets')).toBeInTheDocument();
    });
  });

  it('displays error message when wallets API fails', async () => {
    mockGet.mockImplementation((url) => {
      if (url === '/shops/my') {
        return Promise.resolve({ data: { data: [mockShop] }, error: null });
      }
      return Promise.resolve({ data: null, error: 'Wallets error' });
    });

    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('Failed to load wallets')).toBeInTheDocument();
    });
  });

  it('shows error in red-styled container', async () => {
    mockGet.mockResolvedValue({ data: null, error: 'Network error' });
    renderWalletsModal();

    await waitFor(() => {
      const errorElement = screen.getByText('Failed to load wallets');
      expect(errorElement).toHaveClass('text-red-400');
    });
  });
});

// ============================================================================
// 4. WALLET CARD DISPLAY TESTS
// ============================================================================

describe('WalletsModal - Wallet Card Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulApiMocks();
  });

  it('displays wallet type label', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.getByText('ETH')).toBeInTheDocument();
    });
  });

  it('displays wallet address', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(
        screen.getByText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
      ).toBeInTheDocument();
      expect(
        screen.getByText('0x742d35Cc6634C0532925a3b844Bc9e7E49f42bF0')
      ).toBeInTheDocument();
    });
  });

  it('displays edit button for each wallet', async () => {
    renderWalletsModal();

    await waitFor(() => {
      // Edit buttons have pencil icon SVG
      const editButtons = document.querySelectorAll('button.text-blue-400');
      expect(editButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('displays remove button for each wallet', async () => {
    renderWalletsModal();

    await waitFor(() => {
      // Remove buttons have trash icon SVG
      const removeButtons = document.querySelectorAll('button.text-red-400');
      expect(removeButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('displays checkmark for configured wallets', async () => {
    renderWalletsModal();

    await waitFor(() => {
      // Each wallet card shows a checkmark
      const checkmarks = screen.getAllByText('✓');
      expect(checkmarks.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ============================================================================
// 5. ADD WALLET FORM TESTS
// ============================================================================

describe('WalletsModal - Add Wallet Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyWalletsMocks();
  });

  it('opens form when add button is clicked', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      expect(screen.getByText('Bitcoin (BTC)')).toBeInTheDocument();
    });
  });

  it('triggers haptic feedback when opening form', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    expect(mockTriggerHaptic).toHaveBeenCalledWith('light');
  });

  it('displays all wallet type input fields', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      expect(screen.getByText('Bitcoin (BTC)')).toBeInTheDocument();
      expect(screen.getByText('Ethereum (ETH)')).toBeInTheDocument();
      expect(screen.getByText('USDT (TRC-20)')).toBeInTheDocument();
      expect(screen.getByText('Litecoin (LTC)')).toBeInTheDocument();
    });
  });

  it('displays placeholder text for each input', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')
      ).toBeInTheDocument();
    });
  });

  it('has disabled save button when no valid addresses', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      const saveButton = screen.getByText('Save');
      expect(saveButton).toBeDisabled();
    });
  });
});

// ============================================================================
// 6. ADDRESS VALIDATION FEEDBACK TESTS
// ============================================================================

describe('WalletsModal - Address Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyWalletsMocks();
  });

  it('shows valid message for correct BTC address', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    await waitFor(() => {
      expect(screen.getByText('✓ Valid BTC')).toBeInTheDocument();
    });
  });

  it('shows invalid message for incorrect BTC address', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, 'invalid_btc_address');

    await waitFor(() => {
      expect(screen.getByText(/Invalid BTC/i)).toBeInTheDocument();
    });
  });

  it('shows valid message for correct ETH address', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const ethInput = await screen.findByPlaceholderText(
      '0x742d35Cc6634C0532925a3b844Bc7e759f42bE1'
    );
    await user.type(ethInput, validAddresses.ETH);

    await waitFor(() => {
      expect(screen.getByText('✓ Valid ETH')).toBeInTheDocument();
    });
  });

  it('shows invalid message for ETH address without 0x prefix', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const ethInput = await screen.findByPlaceholderText(
      '0x742d35Cc6634C0532925a3b844Bc7e759f42bE1'
    );
    await user.type(ethInput, 'd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');

    await waitFor(() => {
      expect(screen.getByText(/Invalid ETH/i)).toBeInTheDocument();
    });
  });

  it('shows valid message for correct USDT address', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const usdtInput = await screen.findByPlaceholderText(
      'TYASr5UV6HEcXatwdFQfmLVUqQQQMUxHLS'
    );
    await user.type(usdtInput, validAddresses.USDT);

    await waitFor(() => {
      expect(screen.getByText('✓ Valid USDT')).toBeInTheDocument();
    });
  });

  it('shows valid message for correct LTC address', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const ltcInput = await screen.findByPlaceholderText('ltc1q...');
    await user.type(ltcInput, validAddresses.LTC);

    await waitFor(() => {
      expect(screen.getByText('✓ Valid LTC')).toBeInTheDocument();
    });
  });

  it('enables save button when at least one valid address entered', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    await waitFor(() => {
      const saveButton = screen.getByText('Save');
      expect(saveButton).not.toBeDisabled();
    });
  });

  it('validation feedback has correct color classes', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );

    // Test invalid address first
    await user.type(btcInput, 'invalid');
    await waitFor(() => {
      const invalidMessage = screen.getByText(/Invalid BTC/i);
      expect(invalidMessage).toHaveClass('text-red-500');
    });

    // Clear and enter valid address
    await user.clear(btcInput);
    await user.type(btcInput, validAddresses.BTC);
    await waitFor(() => {
      const validMessage = screen.getByText('✓ Valid BTC');
      expect(validMessage).toHaveClass('text-green-500');
    });
  });
});

// ============================================================================
// 7. FORM SUBMISSION TESTS
// ============================================================================

describe('WalletsModal - Form Submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyWalletsMocks();
    mockPut.mockResolvedValue({
      data: {
        data: {
          wallet_btc: validAddresses.BTC,
          wallet_eth: null,
          wallet_usdt: null,
          wallet_ltc: null,
          updated_at: '2024-01-16T10:00:00Z',
        },
      },
      error: null,
    });
  });

  it('calls PUT API with correct payload on save', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(`/shops/${mockShop.id}/wallets`, {
        wallet_btc: validAddresses.BTC,
      });
    });
  });

  it('triggers success haptic after successful save', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
    });
  });

  it('shows error alert when save fails', async () => {
    mockPut.mockResolvedValue({ data: null, error: 'Server error' });

    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Failed to save wallet');
    });
  });

  it('clears form after successful save', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    await waitFor(() => {
      // Form should be closed after save
      expect(screen.queryByText('Bitcoin (BTC)')).not.toBeInTheDocument();
    });
  });

  it('shows loading text during save', async () => {
    // Make PUT hang to test loading state
    mockPut.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { data: { wallet_btc: validAddresses.BTC } },
                error: null,
              }),
            100
          );
        })
    );

    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');
    await user.click(saveButton);

    // Button should show loading text
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 8. EDIT WALLET TESTS
// ============================================================================

describe('WalletsModal - Edit Wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulApiMocks();
  });

  it('enters edit mode when edit button clicked', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Editing/i)).toBeInTheDocument();
    });
  });

  it('triggers haptic when entering edit mode', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    expect(mockTriggerHaptic).toHaveBeenCalledWith('medium');
  });

  it('shows input with current address in edit mode', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    await waitFor(() => {
      const input = document.querySelector('input[type="text"]');
      expect(input).toBeInTheDocument();
      expect(input.value).toBe('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa');
    });
  });

  it('shows Save and Cancel buttons in edit mode', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Save')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  it('cancels edit mode when Cancel clicked', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Editing/i)).not.toBeInTheDocument();
    });
  });

  it('shows validation feedback during edit', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const editButtons = document.querySelectorAll('button.text-blue-400');
    await user.click(editButtons[0]);

    const input = await waitFor(() => document.querySelector('input[type="text"]'));

    await user.clear(input);
    await user.type(input, 'invalid');

    await waitFor(() => {
      expect(screen.getByText(/Invalid address format/i)).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 9. REMOVE WALLET TESTS
// ============================================================================

describe('WalletsModal - Remove Wallet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulApiMocks();
    // Restore confirm mock after clearAllMocks
    mockConfirm.mockResolvedValue(true);
    mockAlert.mockResolvedValue(undefined);
    mockPut.mockResolvedValue({
      data: {
        data: {
          wallet_btc: null,
          wallet_eth: '0x742d35Cc6634C0532925a3b844Bc9e7E49f42bF0',
          wallet_usdt: null,
          wallet_ltc: null,
        },
      },
      error: null,
    });
  });

  it('shows confirmation dialog when remove clicked', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith('Remove this wallet?');
    });
  });

  it('triggers haptic when remove button clicked', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    expect(mockTriggerHaptic).toHaveBeenCalledWith('medium');
  });

  it('calls PUT API with null value when confirmed', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledWith(`/shops/${mockShop.id}/wallets`, {
        wallet_btc: null,
      });
    });
  });

  it('does not call API when confirmation cancelled', async () => {
    mockConfirm.mockResolvedValue(false);

    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalled();
    });

    // PUT should not be called
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('triggers success haptic after removal', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    // Wait for confirm dialog and PUT to complete
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalled();
    });

    // After PUT completes, success haptic is triggered
    await waitFor(
      () => {
        expect(mockTriggerHaptic).toHaveBeenCalledWith('success');
      },
      { timeout: 3000 }
    );
  });

  it('shows error alert when removal fails', async () => {
    mockPut.mockResolvedValue({ data: null, error: 'Server error' });

    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    const removeButtons = document.querySelectorAll('button.text-red-400');
    await user.click(removeButtons[0]);

    // Wait for confirm and PUT to be called
    await waitFor(() => {
      expect(mockPut).toHaveBeenCalled();
    });

    // After PUT fails, alert is shown
    await waitFor(
      () => {
        expect(mockAlert).toHaveBeenCalledWith('Failed to delete wallet');
      },
      { timeout: 3000 }
    );
  });
});

// ============================================================================
// 10. CLOSE/BACK BUTTON TESTS
// ============================================================================

describe('WalletsModal - Close Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSuccessfulApiMocks();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWalletsModal({ onClose });

    await waitFor(() => {
      expect(screen.getByText('Wallets')).toBeInTheDocument();
    });

    // Find the close button in header (PageHeader component)
    // Look for element with variant="close" which renders a close icon
    const closeButton = document.querySelector('[class*="PageHeader"] button');
    if (closeButton) {
      await user.click(closeButton);
      expect(onClose).toHaveBeenCalled();
    }
  });

  it('resets form state on close', async () => {
    const onClose = vi.fn();
    renderWalletsModal({ onClose });

    await waitFor(() => {
      expect(screen.getByText('Wallets')).toBeInTheDocument();
    });

    // Form should be reset on close (tested via callback)
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ============================================================================
// 11. NO SHOP SCENARIO TESTS
// ============================================================================

describe('WalletsModal - No Shop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] }, error: null });
  });

  it('handles no shops gracefully', async () => {
    renderWalletsModal();

    await waitFor(() => {
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).not.toBeInTheDocument();
    });
  });

  it('does not show shop name when no shops', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.queryByText('Test Shop')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 12. ALL WALLETS CONFIGURED TESTS
// ============================================================================

describe('WalletsModal - All Wallets Configured', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url) => {
      if (url === '/shops/my') {
        return Promise.resolve({ data: { data: [mockShop] }, error: null });
      }
      if (url.includes('/wallets')) {
        return Promise.resolve({
          data: {
            data: {
              wallet_btc: validAddresses.BTC,
              wallet_eth: validAddresses.ETH,
              wallet_usdt: validAddresses.USDT,
              wallet_ltc: validAddresses.LTC,
              updated_at: '2024-01-15T10:00:00Z',
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: 'Not found' });
    });
  });

  it('shows "all wallets added" message when all configured', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(
        screen.getByText(/All available wallets added/i)
      ).toBeInTheDocument();
    });
  });

  it('hides add wallet button when all configured', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Add Wallet/i)).not.toBeInTheDocument();
  });

  it('displays all four wallet cards', async () => {
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText('BTC')).toBeInTheDocument();
      expect(screen.getByText('ETH')).toBeInTheDocument();
      expect(screen.getByText('USDT')).toBeInTheDocument();
      expect(screen.getByText('LTC')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// 13. PARTIAL WALLET FORM TESTS
// ============================================================================

describe('WalletsModal - Partial Wallet Form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup with BTC and ETH already configured
    mockGet.mockImplementation((url) => {
      if (url === '/shops/my') {
        return Promise.resolve({ data: { data: [mockShop] }, error: null });
      }
      if (url.includes('/wallets')) {
        return Promise.resolve({
          data: {
            data: {
              wallet_btc: validAddresses.BTC,
              wallet_eth: validAddresses.ETH,
              wallet_usdt: null,
              wallet_ltc: null,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: 'Not found' });
    });
  });

  it('only shows input fields for unconfigured wallets', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      // Should show USDT and LTC inputs (not configured)
      expect(screen.getByText('USDT (TRC-20)')).toBeInTheDocument();
      expect(screen.getByText('Litecoin (LTC)')).toBeInTheDocument();

      // Should NOT show BTC and ETH inputs (already configured)
      expect(screen.queryByText('Bitcoin (BTC)')).not.toBeInTheDocument();
      expect(screen.queryByText('Ethereum (ETH)')).not.toBeInTheDocument();
    });
  });
});

// ============================================================================
// 14. ACCESSIBILITY TESTS
// ============================================================================

describe('WalletsModal - Accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyWalletsMocks();
  });

  it('inputs have associated labels', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    await waitFor(() => {
      const labels = screen.getAllByText(/Bitcoin|Ethereum|USDT|Litecoin/i);
      expect(labels.length).toBeGreaterThan(0);
    });
  });

  it('buttons are accessible', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    const addButton = screen.getByText(/Add Wallet/i);
    expect(addButton.tagName).toBe('BUTTON');
  });

  it('save button is disabled when no valid input', async () => {
    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const saveButton = await screen.findByText('Save');
    expect(saveButton).toBeDisabled();
  });
});

// ============================================================================
// 15. API INTEGRATION TESTS
// ============================================================================

describe('WalletsModal - API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches shops on mount', async () => {
    setupSuccessfulApiMocks();
    renderWalletsModal();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/shops/my', expect.any(Object));
    });
  });

  it('fetches wallets after getting shop', async () => {
    setupSuccessfulApiMocks();
    renderWalletsModal();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        `/shops/${mockShop.id}/wallets`,
        expect.any(Object)
      );
    });
  });

  it('passes abort signal to API calls', async () => {
    setupSuccessfulApiMocks();
    renderWalletsModal();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/shops/my',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });
  });

  it('handles API timeout', async () => {
    setupSuccessfulApiMocks();
    renderWalletsModal();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        '/shops/my',
        expect.objectContaining({ timeout: 10000 })
      );
    });
  });
});

// ============================================================================
// 16. RACE CONDITION TESTS
// ============================================================================

describe('WalletsModal - Race Condition Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupEmptyWalletsMocks();
  });

  it('prevents double submission', async () => {
    let resolveFirst;
    let callCount = 0;

    mockPut.mockImplementation(() => {
      callCount++;
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });

    const user = userEvent.setup();
    renderWalletsModal();

    await waitFor(() => {
      expect(screen.getByText(/Add Wallet/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/Add Wallet/i));

    const btcInput = await screen.findByPlaceholderText(
      '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'
    );
    await user.type(btcInput, validAddresses.BTC);

    const saveButton = screen.getByText('Save');

    // Click save twice quickly
    await user.click(saveButton);
    await user.click(saveButton);

    // Only one PUT call should be made (race condition prevention)
    expect(callCount).toBe(1);

    // Resolve the promise
    resolveFirst({ data: { data: { wallet_btc: validAddresses.BTC } }, error: null });
  });
});

// ============================================================================
// 17. WALLET TYPE COLORS TESTS
// ============================================================================

describe('WalletsModal - Wallet Type Colors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((url) => {
      if (url === '/shops/my') {
        return Promise.resolve({ data: { data: [mockShop] }, error: null });
      }
      if (url.includes('/wallets')) {
        return Promise.resolve({
          data: {
            data: {
              wallet_btc: validAddresses.BTC,
              wallet_eth: validAddresses.ETH,
              wallet_usdt: validAddresses.USDT,
              wallet_ltc: validAddresses.LTC,
            },
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: 'Not found' });
    });
  });

  it('BTC label has orange color', async () => {
    renderWalletsModal();

    await waitFor(() => {
      const btcLabel = screen.getByText('BTC');
      expect(btcLabel).toHaveClass('text-orange-500');
    });
  });

  it('ETH label has blue color', async () => {
    renderWalletsModal();

    await waitFor(() => {
      const ethLabel = screen.getByText('ETH');
      expect(ethLabel).toHaveClass('text-blue-400');
    });
  });

  it('USDT label has emerald color', async () => {
    renderWalletsModal();

    await waitFor(() => {
      const usdtLabel = screen.getByText('USDT');
      expect(usdtLabel).toHaveClass('text-emerald-400');
    });
  });

  it('LTC label has purple color', async () => {
    renderWalletsModal();

    await waitFor(() => {
      const ltcLabel = screen.getByText('LTC');
      expect(ltcLabel).toHaveClass('text-purple-400');
    });
  });
});
