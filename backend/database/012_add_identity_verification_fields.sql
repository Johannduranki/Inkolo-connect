SET NAMES utf8mb4;

ALTER TABLE member_profiles
  ADD COLUMN date_of_birth DATE NULL AFTER id_number,
  ADD COLUMN gender VARCHAR(32) NULL AFTER date_of_birth,
  ADD COLUMN identity_verification_method VARCHAR(50) NULL AFTER gender;

