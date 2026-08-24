-- Duranki existing database setup script
-- Target: MySQL 8 / MariaDB
--
-- How to use:
-- 1. Open your existing database in MySQL Workbench, phpMyAdmin, DBeaver, or the mysql CLI.
-- 2. Select the database first, for example:
--      USE your_existing_database_name;
-- 3. Run this full script.
--
-- This script does not drop tables and does not delete existing data.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  id_number_hash CHAR(64) NOT NULL,
  id_number_last4 CHAR(4) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  status ENUM('active', 'inactive', 'locked') NOT NULL DEFAULT 'active',
  membership_type ENUM('free', 'paid') NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_id_number_hash (id_number_hash)
);

DELIMITER $$

CREATE PROCEDURE duranki_add_column_if_missing(
  IN table_name_value VARCHAR(64),
  IN column_name_value VARCHAR(64),
  IN column_definition_value TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = table_name_value
      AND COLUMN_NAME = column_name_value
  ) THEN
    SET @duranki_sql = CONCAT(
      'ALTER TABLE `',
      table_name_value,
      '` ADD COLUMN `',
      column_name_value,
      '` ',
      column_definition_value
    );
    PREPARE duranki_statement FROM @duranki_sql;
    EXECUTE duranki_statement;
    DEALLOCATE PREPARE duranki_statement;
  END IF;
END$$

DELIMITER ;

CALL duranki_add_column_if_missing(
  'users',
  'membership_type',
  "ENUM('free', 'paid') NULL AFTER status"
);

CREATE TABLE IF NOT EXISTS service_subscriptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  service_code VARCHAR(50) NOT NULL,
  plan_code VARCHAR(50) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active', 'cancelled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_service (user_id, service_code),
  CONSTRAINT fk_service_subscriptions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_applications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  service_code VARCHAR(50) NOT NULL,
  status ENUM('submitted', 'approved', 'declined') NOT NULL DEFAULT 'submitted',
  bank_confirmation_path VARCHAR(500) NOT NULL,
  id_document_path VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_service_application (user_id, service_code),
  CONSTRAINT fk_service_applications_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_code VARCHAR(50) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_code),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_profiles (
  user_id BIGINT UNSIGNED NOT NULL,
  id_number VARCHAR(32) NULL,
  telephone_number VARCHAR(20) NULL,
  email VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  postal_code VARCHAR(20) NULL,
  emergency_contact_name VARCHAR(200) NULL,
  emergency_contact_number VARCHAR(20) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_member_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS churches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  denomination VARCHAR(150) NULL,
  region VARCHAR(150) NULL,
  province VARCHAR(150) NULL,
  status ENUM('ACTIVE', 'PENDING', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  logo_url MEDIUMTEXT NULL,
  primary_color CHAR(7) NOT NULL DEFAULT '#062d6b',
  secondary_color CHAR(7) NOT NULL DEFAULT '#087ce8',
  accent_color CHAR(7) NOT NULL DEFAULT '#58c91a',
  background_color CHAR(7) NOT NULL DEFAULT '#f2f8ff',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CALL duranki_add_column_if_missing('churches', 'logo_url', 'MEDIUMTEXT NULL AFTER status');
CALL duranki_add_column_if_missing('churches', 'primary_color', "CHAR(7) NOT NULL DEFAULT '#062d6b' AFTER logo_url");
CALL duranki_add_column_if_missing('churches', 'secondary_color', "CHAR(7) NOT NULL DEFAULT '#087ce8' AFTER primary_color");
CALL duranki_add_column_if_missing('churches', 'accent_color', "CHAR(7) NOT NULL DEFAULT '#58c91a' AFTER secondary_color");
CALL duranki_add_column_if_missing('churches', 'background_color', "CHAR(7) NOT NULL DEFAULT '#f2f8ff' AFTER accent_color");

CREATE TABLE IF NOT EXISTS church_branches (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  church_id BIGINT UNSIGNED NOT NULL,
  branch_name VARCHAR(255) NOT NULL,
  branch_code VARCHAR(50) NULL,
  pastor_name VARCHAR(200) NULL,
  region VARCHAR(150) NULL,
  province VARCHAR(150) NULL,
  physical_address VARCHAR(255) NULL,
  status ENUM('ACTIVE', 'PENDING', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  CONSTRAINT fk_church_branches_church FOREIGN KEY (church_id) REFERENCES churches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS member_communities (
  user_id BIGINT UNSIGNED NOT NULL,
  church_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_member_communities_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_communities_church FOREIGN KEY (church_id) REFERENCES churches(id),
  CONSTRAINT fk_member_communities_branch FOREIGN KEY (branch_id) REFERENCES church_branches(id)
);

CREATE TABLE IF NOT EXISTS member_contacts (
  owner_user_id BIGINT UNSIGNED NOT NULL,
  contact_user_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (owner_user_id, contact_user_id),
  CONSTRAINT fk_member_contacts_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_member_contacts_contact FOREIGN KEY (contact_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS direct_messages (
  id CHAR(36) NOT NULL,
  conversation_id VARCHAR(64) NOT NULL,
  sender_user_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  message_text VARCHAR(1000) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY ix_direct_messages_conversation (conversation_id, sent_at),
  CONSTRAINT fk_direct_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_direct_messages_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS wallets (
  id CHAR(36) NOT NULL,
  owner_type ENUM('MEMBER', 'CHURCH', 'KZNCC') NOT NULL,
  owner_id VARCHAR(64) NOT NULL,
  wallet_name VARCHAR(255) NOT NULL,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  available_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  pending_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  status ENUM('ACTIVE', 'SUSPENDED', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (id),
  UNIQUE KEY uq_wallet_owner (owner_type, owner_id)
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id CHAR(36) NOT NULL,
  wallet_id CHAR(36) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  direction ENUM('IN', 'OUT') NOT NULL,
  description VARCHAR(255) NOT NULL,
  reference VARCHAR(100) NOT NULL,
  status ENUM('PENDING', 'SUCCESSFUL', 'FAILED') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_wallet_transactions_wallet (wallet_id, created_at),
  CONSTRAINT fk_wallet_transactions_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referrals (
  id CHAR(36) NOT NULL,
  referrer_user_id BIGINT UNSIGNED NOT NULL,
  referred_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('PENDING', 'ACCEPTED', 'DECLINED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id CHAR(36) NOT NULL,
  seller_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NULL,
  item_condition VARCHAR(50) NULL,
  price DECIMAL(14,2) NOT NULL,
  area VARCHAR(150) NULL,
  image_url VARCHAR(500) NULL,
  status ENUM('AVAILABLE', 'RESERVED', 'SOLD', 'REMOVED') NOT NULL DEFAULT 'AVAILABLE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_marketplace_listings_seller FOREIGN KEY (seller_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS job_listings (
  id CHAR(36) NOT NULL,
  listed_by_user_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  category VARCHAR(100) NULL,
  employment_type VARCHAR(50) NULL,
  work_mode VARCHAR(50) NULL,
  area VARCHAR(150) NULL,
  payment_amount DECIMAL(14,2) NULL,
  payment_frequency VARCHAR(50) NULL,
  status ENUM('OPEN', 'PAUSED', 'FILLED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_job_listings_user FOREIGN KEY (listed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS legal_acceptances (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  member_name VARCHAR(255) NOT NULL,
  member_telephone VARCHAR(20) NULL,
  member_email VARCHAR(255) NULL,
  service_code VARCHAR(50) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  plan_code VARCHAR(50) NOT NULL,
  document_title VARCHAR(255) NOT NULL,
  document_version VARCHAR(30) NOT NULL,
  document_sha256 CHAR(64) NOT NULL,
  document_mime_type VARCHAR(100) NOT NULL,
  document_source_file VARCHAR(255) NULL,
  document_snapshot LONGTEXT NOT NULL,
  consent_statement VARCHAR(500) NOT NULL,
  accepted_at DATETIME(3) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_legal_acceptances_user (user_id, accepted_at),
  KEY ix_legal_acceptances_service (service_code, accepted_at),
  CONSTRAINT fk_legal_acceptances_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

INSERT INTO schema_migrations (filename)
VALUES
  ('001_create_users.sql'),
  ('002_add_membership.sql'),
  ('003_create_service_subscriptions.sql'),
  ('004_create_service_applications.sql'),
  ('005_create_platform_tables.sql'),
  ('006_create_legal_acceptances.sql'),
  ('007_add_church_branding.sql')
ON DUPLICATE KEY UPDATE applied_at = applied_at;

DROP PROCEDURE IF EXISTS duranki_add_column_if_missing;
