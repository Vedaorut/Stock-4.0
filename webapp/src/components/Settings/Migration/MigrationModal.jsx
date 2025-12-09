import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '../../common/PageHeader';
import { useTelegram } from '../../../hooks/useTelegram';
import { useBackButton } from '../../../hooks/useBackButton';
import { useMigration } from './useMigration';
import { MigrationHero } from './MigrationHero';
import { MigrationForm } from './MigrationForm';
import { MigrationSuccess } from './MigrationSuccess';

/**
 * Migration Modal - Main container component
 * Handles shop channel migration with multi-step flow
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Modal visibility state
 * @param {function} props.onClose - Close callback
 */
export default function MigrationModal({ isOpen, onClose }) {
  const { triggerHaptic, confirm, alert } = useTelegram();
  
  const { state, actions, computed } = useMigration({
    isOpen,
    onClose,
    triggerHaptic,
    confirm,
    alert,
  });

  const {
    step,
    newChannel,
    loading,
    eligibility,
    migrationResult,
    errorMessage,
    migrationError,
    countdown,
    channelError,
    isChannelValid,
  } = state;

  const {
    setStep,
    handleChannelChange,
    handleMigrate,
    retryEligibility,
    stopCountdown,
  } = actions;

  const {
    subscriberCount,
    daysUntilNext,
    canMigrate,
  } = computed;

  // Back button support - handle multi-step navigation
  const handleBack = useCallback(() => {
    if (step > 1 && step < 3) {
      setStep(step - 1);
    } else {
      onClose();
    }
  }, [step, setStep, onClose]);

  useBackButton(isOpen ? handleBack : null);

  const isStepNavigation = step > 1 && step < 3;
  const headerVariant = isStepNavigation ? 'back' : 'close';

  // Handle continue to input step
  const handleContinue = useCallback(() => {
    triggerHaptic('light');
    setStep(2);
  }, [triggerHaptic, setStep]);

  // Handle close with countdown cleanup
  const handleClose = useCallback(() => {
    stopCountdown();
    onClose();
  }, [stopCountdown, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 bg-[#181818] overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          >
          <PageHeader
            title={step === 3 ? 'Done' : 'Migration'}
            onBack={handleBack}
            variant={headerVariant}
          />

          <div
            className="px-4 pb-8"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 72px)' }}
          >
            <AnimatePresence mode="wait">
              {/* STEP 1: Hero Screen */}
              {step === 1 && (
                <MigrationHero
                  loading={loading}
                  errorMessage={errorMessage}
                  eligibility={eligibility}
                  subscriberCount={subscriberCount}
                  daysUntilNext={daysUntilNext}
                  canMigrate={canMigrate}
                  onRetry={retryEligibility}
                  onContinue={handleContinue}
                />
              )}

              {/* STEP 2: Input Screen */}
              {step === 2 && (
                <MigrationForm
                  newChannel={newChannel}
                  onChannelChange={handleChannelChange}
                  channelError={channelError}
                  isChannelValid={isChannelValid}
                  migrationError={migrationError}
                  loading={loading}
                  subscriberCount={subscriberCount}
                  onSubmit={handleMigrate}
                />
              )}

              {/* STEP 3: Success Screen */}
              {step === 3 && (
                <MigrationSuccess
                  migrationResult={migrationResult}
                  countdown={countdown}
                  onClose={handleClose}
                />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
