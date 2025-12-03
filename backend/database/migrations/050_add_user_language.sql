-- Migration: Add user language preference for i18n support
-- Supports Russian (default) and English

-- Add column if not exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'ru';

-- Add constraint safely (drop if exists first)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_language_check'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_language_check CHECK (language IN ('ru', 'en'));
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_language ON users(language);

-- Add comment
COMMENT ON COLUMN users.language IS 'User preferred language for notifications (ru, en)';
