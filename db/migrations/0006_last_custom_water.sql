-- The last custom water amount, prefilled in the diary like a food's last_amount. NULL until one is logged.
ALTER TABLE user_settings ADD COLUMN last_water_ml REAL;
ALTER TABLE user_settings ADD COLUMN last_water_unit TEXT CHECK (last_water_unit IN ('ml', 'l'));
