USE duranki_login;

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS logo_url MEDIUMTEXT NULL AFTER status,
  ADD COLUMN IF NOT EXISTS primary_color CHAR(7) NOT NULL DEFAULT '#062d6b' AFTER logo_url,
  ADD COLUMN IF NOT EXISTS secondary_color CHAR(7) NOT NULL DEFAULT '#087ce8' AFTER primary_color,
  ADD COLUMN IF NOT EXISTS accent_color CHAR(7) NOT NULL DEFAULT '#58c91a' AFTER secondary_color,
  ADD COLUMN IF NOT EXISTS background_color CHAR(7) NOT NULL DEFAULT '#f2f8ff' AFTER accent_color;
