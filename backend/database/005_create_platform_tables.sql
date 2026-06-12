USE duranki_login;

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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

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
