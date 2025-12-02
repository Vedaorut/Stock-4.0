/**
 * Backward compatible re-export of MigrationModal
 * 
 * The component has been refactored into modular components:
 * - Migration/MigrationModal.jsx - Main container (~130 LOC)
 * - Migration/MigrationHero.jsx - Hero/info screen (Step 1)
 * - Migration/MigrationForm.jsx - Channel input form (Step 2)
 * - Migration/MigrationSuccess.jsx - Success screen (Step 3)
 * - Migration/MigrationIcons.jsx - Animated icons
 * - Migration/useMigration.js - Custom hook with state logic
 * 
 * For new code, prefer importing from:
 * import { MigrationModal } from './Migration';
 */
export { default } from './Migration/MigrationModal';
