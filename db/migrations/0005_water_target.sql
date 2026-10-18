-- NULL means the daily water goal follows body weight (35 ml/kg)
ALTER TABLE user_settings ADD COLUMN water_target REAL;
