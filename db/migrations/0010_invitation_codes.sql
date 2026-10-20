ALTER TABLE invitations ADD COLUMN code TEXT;
CREATE UNIQUE INDEX invitations_code_unique ON invitations(code);
