SET NAMES utf8mb4;

ALTER TABLE users
  ADD COLUMN password_hash CHAR(64) NULL AFTER email;
