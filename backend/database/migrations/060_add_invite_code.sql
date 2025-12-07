-- Migration 060: Add invite_code column to shops table
-- Personalized invite links based on shop name instead of generic shop_123

-- Add invite_code column
ALTER TABLE shops ADD COLUMN IF NOT EXISTS invite_code VARCHAR(50);

-- Create unique index for invite_code lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_invite_code ON shops(invite_code) WHERE invite_code IS NOT NULL;

-- Backfill existing shops with generated invite codes
-- Uses shop name transliterated to ASCII, cleaned, with random suffix for uniqueness
DO $$
DECLARE
  shop_record RECORD;
  base_code VARCHAR(50);
  final_code VARCHAR(50);
  suffix VARCHAR(5);
  counter INT;
BEGIN
  FOR shop_record IN SELECT id, name FROM shops WHERE invite_code IS NULL LOOP
    -- Generate base code from shop name
    -- Transliterate common Russian characters and clean
    base_code := shop_record.name;

    -- Russian transliteration
    base_code := REPLACE(base_code, 'а', 'a');
    base_code := REPLACE(base_code, 'б', 'b');
    base_code := REPLACE(base_code, 'в', 'v');
    base_code := REPLACE(base_code, 'г', 'g');
    base_code := REPLACE(base_code, 'д', 'd');
    base_code := REPLACE(base_code, 'е', 'e');
    base_code := REPLACE(base_code, 'ё', 'yo');
    base_code := REPLACE(base_code, 'ж', 'zh');
    base_code := REPLACE(base_code, 'з', 'z');
    base_code := REPLACE(base_code, 'и', 'i');
    base_code := REPLACE(base_code, 'й', 'y');
    base_code := REPLACE(base_code, 'к', 'k');
    base_code := REPLACE(base_code, 'л', 'l');
    base_code := REPLACE(base_code, 'м', 'm');
    base_code := REPLACE(base_code, 'н', 'n');
    base_code := REPLACE(base_code, 'о', 'o');
    base_code := REPLACE(base_code, 'п', 'p');
    base_code := REPLACE(base_code, 'р', 'r');
    base_code := REPLACE(base_code, 'с', 's');
    base_code := REPLACE(base_code, 'т', 't');
    base_code := REPLACE(base_code, 'у', 'u');
    base_code := REPLACE(base_code, 'ф', 'f');
    base_code := REPLACE(base_code, 'х', 'h');
    base_code := REPLACE(base_code, 'ц', 'ts');
    base_code := REPLACE(base_code, 'ч', 'ch');
    base_code := REPLACE(base_code, 'ш', 'sh');
    base_code := REPLACE(base_code, 'щ', 'sch');
    base_code := REPLACE(base_code, 'ъ', '');
    base_code := REPLACE(base_code, 'ы', 'y');
    base_code := REPLACE(base_code, 'ь', '');
    base_code := REPLACE(base_code, 'э', 'e');
    base_code := REPLACE(base_code, 'ю', 'yu');
    base_code := REPLACE(base_code, 'я', 'ya');
    -- Uppercase Russian
    base_code := REPLACE(base_code, 'А', 'A');
    base_code := REPLACE(base_code, 'Б', 'B');
    base_code := REPLACE(base_code, 'В', 'V');
    base_code := REPLACE(base_code, 'Г', 'G');
    base_code := REPLACE(base_code, 'Д', 'D');
    base_code := REPLACE(base_code, 'Е', 'E');
    base_code := REPLACE(base_code, 'Ё', 'Yo');
    base_code := REPLACE(base_code, 'Ж', 'Zh');
    base_code := REPLACE(base_code, 'З', 'Z');
    base_code := REPLACE(base_code, 'И', 'I');
    base_code := REPLACE(base_code, 'Й', 'Y');
    base_code := REPLACE(base_code, 'К', 'K');
    base_code := REPLACE(base_code, 'Л', 'L');
    base_code := REPLACE(base_code, 'М', 'M');
    base_code := REPLACE(base_code, 'Н', 'N');
    base_code := REPLACE(base_code, 'О', 'O');
    base_code := REPLACE(base_code, 'П', 'P');
    base_code := REPLACE(base_code, 'Р', 'R');
    base_code := REPLACE(base_code, 'С', 'S');
    base_code := REPLACE(base_code, 'Т', 'T');
    base_code := REPLACE(base_code, 'У', 'U');
    base_code := REPLACE(base_code, 'Ф', 'F');
    base_code := REPLACE(base_code, 'Х', 'H');
    base_code := REPLACE(base_code, 'Ц', 'Ts');
    base_code := REPLACE(base_code, 'Ч', 'Ch');
    base_code := REPLACE(base_code, 'Ш', 'Sh');
    base_code := REPLACE(base_code, 'Щ', 'Sch');
    base_code := REPLACE(base_code, 'Ъ', '');
    base_code := REPLACE(base_code, 'Ы', 'Y');
    base_code := REPLACE(base_code, 'Ь', '');
    base_code := REPLACE(base_code, 'Э', 'E');
    base_code := REPLACE(base_code, 'Ю', 'Yu');
    base_code := REPLACE(base_code, 'Я', 'Ya');

    -- Replace spaces with underscores
    base_code := REPLACE(base_code, ' ', '_');

    -- Remove non-alphanumeric characters (except underscore and hyphen)
    base_code := REGEXP_REPLACE(base_code, '[^a-zA-Z0-9_-]', '', 'g');

    -- Remove consecutive underscores
    base_code := REGEXP_REPLACE(base_code, '_+', '_', 'g');

    -- Remove leading/trailing underscores
    base_code := TRIM(BOTH '_' FROM base_code);

    -- Truncate to 25 chars (leaving room for suffix)
    base_code := LEFT(base_code, 25);

    -- If empty after cleaning, use 'shop' as fallback
    IF base_code = '' OR base_code IS NULL THEN
      base_code := 'shop';
    END IF;

    -- Generate random suffix and ensure uniqueness
    counter := 0;
    LOOP
      -- Generate 3-char alphanumeric suffix
      suffix := '_' || LOWER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 3));
      final_code := base_code || suffix;

      -- Check if code is unique
      IF NOT EXISTS (SELECT 1 FROM shops WHERE invite_code = final_code) THEN
        EXIT;
      END IF;

      counter := counter + 1;
      IF counter > 100 THEN
        -- Fallback: use shop_id
        final_code := 'shop_' || shop_record.id;
        EXIT;
      END IF;
    END LOOP;

    -- Update the shop
    UPDATE shops SET invite_code = final_code WHERE id = shop_record.id;
  END LOOP;
END $$;

-- Add comment
COMMENT ON COLUMN shops.invite_code IS 'Personalized invite code for deep links (e.g., CoolGadgets_x7k instead of shop_123)';
