CREATE DATABASE IF NOT EXISTS duranki_login
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE duranki_login;

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
