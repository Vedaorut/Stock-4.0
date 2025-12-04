/**
 * useTelegram hook - now uses TelegramProvider context
 *
 * FIXED: No longer creates a new instance for each component
 * - Initialization happens once in TelegramProvider
 * - All components get stable references from context
 *
 * Old approach (problem):
 * - Each component called useTelegram() -> created new hook
 * - 10+ components = 10+ Telegram SDK initializations
 * - Infinite re-renders due to unstable references
 *
 * New approach (solution):
 * - TelegramProvider initializes SDK once on mount
 * - useTelegram() returns context (stable references)
 * - All components share one state
 */

export { useTelegram } from '../providers/TelegramProvider';
