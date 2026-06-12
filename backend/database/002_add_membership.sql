USE duranki_login;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS membership_type ENUM('free', 'paid') NULL
  AFTER status;
