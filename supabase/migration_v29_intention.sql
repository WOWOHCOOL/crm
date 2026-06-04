-- Migration v29: Add intention level to customers
ALTER TABLE customers ADD COLUMN IF NOT EXISTS intention TEXT;
