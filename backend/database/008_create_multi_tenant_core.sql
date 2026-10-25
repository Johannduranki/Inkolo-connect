USE duranki_login;

CREATE TABLE IF NOT EXISTS tenant (
  tenant_id VARCHAR(40) NOT NULL,
  tenant_name VARCHAR(150) NOT NULL,
  company_name VARCHAR(200) NULL,
  website VARCHAR(255) NULL,
  subdomain VARCHAR(150) NOT NULL,
  logo MEDIUMTEXT NULL,
  contact_name VARCHAR(150) NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(40) NULL,
  country VARCHAR(100) NULL,
  status ENUM('CONFIGURED', 'ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'CONFIGURED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id),
  UNIQUE KEY uq_tenant_subdomain (subdomain),
  KEY ix_tenant_status (status)
);

CREATE TABLE IF NOT EXISTS community (
  community_id VARCHAR(40) NOT NULL,
  tenant_id VARCHAR(40) NOT NULL,
  community_name VARCHAR(180) NOT NULL,
  community_type VARCHAR(80) NOT NULL,
  country VARCHAR(100) NULL,
  region VARCHAR(120) NULL,
  town VARCHAR(120) NULL,
  logo MEDIUMTEXT NULL,
  description TEXT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (community_id),
  UNIQUE KEY uq_community_tenant (tenant_id, community_id),
  KEY ix_community_tenant_status (tenant_id, status),
  CONSTRAINT fk_community_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS service (
  service_id VARCHAR(40) NOT NULL,
  service_name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  service_type VARCHAR(80) NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE', 'RETIRED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id),
  UNIQUE KEY uq_service_name (service_name),
  KEY ix_service_status (status)
);

CREATE TABLE IF NOT EXISTS user_tenant_role (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id VARCHAR(40) NULL,
  tenant_scope_id VARCHAR(40) GENERATED ALWAYS AS (COALESCE(tenant_id, 'DURANKI')) STORED,
  role ENUM('DURANKI_ADMIN', 'TENANT_ADMIN', 'TENANT_USER') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_tenant_role (user_id, tenant_scope_id, role),
  KEY ix_user_tenant_role_tenant (tenant_id, role, status),
  CONSTRAINT fk_user_tenant_role_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_tenant_role_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    -- MariaDB cannot cascade updates into a generated column's source.
    -- Keep referenced tenant IDs stable while roles exist.
    ON DELETE CASCADE ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS user_community_role (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  tenant_id VARCHAR(40) NOT NULL,
  community_id VARCHAR(40) NOT NULL,
  role ENUM('COMMUNITY_ADMIN', 'COMMUNITY_MANAGER', 'COMMUNITY_MEMBER') NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_community_role (user_id, tenant_id, community_id, role),
  KEY ix_user_community_role_scope (tenant_id, community_id, role, status),
  CONSTRAINT fk_user_community_role_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_user_community_role_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_service (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(40) NOT NULL,
  service_id VARCHAR(40) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_service (tenant_id, service_id),
  KEY ix_tenant_service_enabled (tenant_id, service_id, enabled),
  CONSTRAINT fk_tenant_service_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tenant_service_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS community_service (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id VARCHAR(40) NOT NULL,
  community_id VARCHAR(40) NOT NULL,
  service_id VARCHAR(40) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  tenant_service_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  configuration JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_community_service (tenant_id, community_id, service_id),
  CONSTRAINT fk_community_service_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_community_service_tenant_service
    FOREIGN KEY (tenant_id, service_id, tenant_service_enabled) REFERENCES tenant_service(tenant_id, service_id, enabled)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE IF NOT EXISTS transactions (
  transaction_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(40) NOT NULL,
  community_id VARCHAR(40) NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  service_id VARCHAR(40) NOT NULL,
  transaction_type VARCHAR(80) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  transaction_fee DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  status ENUM('PENDING', 'SUCCESSFUL', 'FAILED', 'REVERSED') NOT NULL DEFAULT 'PENDING',
  reference VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (transaction_id),
  UNIQUE KEY uq_transactions_reference (reference),
  KEY ix_transactions_tenant_created (tenant_id, created_at),
  KEY ix_transactions_community_created (tenant_id, community_id, created_at),
  KEY ix_transactions_user_created (user_id, created_at),
  KEY ix_transactions_service_created (service_id, created_at),
  CONSTRAINT fk_transactions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_transactions_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS revenue_share_rule (
  rule_id VARCHAR(64) NOT NULL,
  tenant_id VARCHAR(40) NULL,
  community_id VARCHAR(40) NULL,
  service_id VARCHAR(40) NULL,
  duranki_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  tenant_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  community_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  partner_percentage DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (rule_id),
  KEY ix_revenue_share_rule_scope (tenant_id, community_id, service_id, status),
  CONSTRAINT fk_revenue_share_rule_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_revenue_share_rule_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_revenue_share_rule_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_revenue_share_rule_percentages
    CHECK (
      duranki_percentage >= 0
      AND tenant_percentage >= 0
      AND community_percentage >= 0
      AND partner_percentage >= 0
      AND duranki_percentage + tenant_percentage + community_percentage + partner_percentage <= 100
    )
);

ALTER TABLE tenant
  MODIFY COLUMN status ENUM('CONFIGURED', 'ACTIVE', 'INACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'CONFIGURED';

ALTER TABLE service_subscriptions
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN service_id VARCHAR(40) NULL AFTER community_id;

ALTER TABLE service_subscriptions
  ADD KEY ix_service_subscriptions_scope (tenant_id, community_id, service_id),
  ADD CONSTRAINT fk_service_subscriptions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_service_subscriptions_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_service_subscriptions_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE service_applications
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN service_id VARCHAR(40) NULL AFTER community_id;

ALTER TABLE service_applications
  ADD KEY ix_service_applications_scope (tenant_id, community_id, service_id),
  ADD CONSTRAINT fk_service_applications_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_service_applications_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_service_applications_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE wallets
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER community_id;

ALTER TABLE wallets
  ADD KEY ix_wallets_scope (tenant_id, community_id, user_id),
  ADD CONSTRAINT fk_wallets_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_wallets_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_wallets_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT;

ALTER TABLE wallet_transactions
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER community_id,
  ADD COLUMN service_id VARCHAR(40) NULL AFTER user_id;

ALTER TABLE wallet_transactions
  ADD KEY ix_wallet_transactions_scope (tenant_id, community_id, user_id, service_id),
  ADD CONSTRAINT fk_wallet_transactions_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_wallet_transactions_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_wallet_transactions_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wallet_transactions_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE marketplace_listings
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN service_id VARCHAR(40) NULL AFTER community_id;

ALTER TABLE marketplace_listings
  ADD KEY ix_marketplace_listings_scope (tenant_id, community_id, service_id),
  ADD CONSTRAINT fk_marketplace_listings_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_marketplace_listings_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_marketplace_listings_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE job_listings
  ADD COLUMN tenant_id VARCHAR(40) NULL AFTER id,
  ADD COLUMN community_id VARCHAR(40) NULL AFTER tenant_id,
  ADD COLUMN service_id VARCHAR(40) NULL AFTER community_id;

ALTER TABLE job_listings
  ADD KEY ix_job_listings_scope (tenant_id, community_id, service_id),
  ADD CONSTRAINT fk_job_listings_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_job_listings_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT fk_job_listings_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO service (service_id, service_name, description, service_type, status)
VALUES
  ('SERVICE-MARKETPLACE', 'Marketplace', 'Community buying and selling marketplace.', 'COMMERCE', 'ACTIVE'),
  ('SERVICE-JOBS-GIGS', 'Jobs & Gigs', 'Jobs, gigs and local work opportunities.', 'WORK', 'ACTIVE'),
  ('SERVICE-WALLET', 'Wallet', 'Duranki Wallet balances, transfers and payments.', 'MONEY', 'ACTIVE'),
  ('SERVICE-VUMA', 'Vuma', 'Vuma fibre, data and micro ISP services.', 'CONNECTIVITY', 'ACTIVE'),
  ('SERVICE-PAYMENTS', 'Payments', 'Payment acceptance and payment routing.', 'MONEY', 'ACTIVE'),
  ('SERVICE-AIRTIME', 'Airtime', 'Airtime purchases and mobile top-ups.', 'UTILITY', 'ACTIVE'),
  ('SERVICE-ELECTRICITY', 'Electricity', 'Prepaid electricity purchases.', 'UTILITY', 'ACTIVE'),
  ('SERVICE-INSURANCE', 'Insurance', 'Insurance applications and policy services.', 'FINANCIAL_SERVICE', 'ACTIVE'),
  ('SERVICE-FUNERAL-COVER', 'Funeral Cover', 'Funeral cover applications and policy services.', 'FINANCIAL_SERVICE', 'ACTIVE'),
  ('SERVICE-EDUCATION', 'Education', 'Education content, courses and learning services.', 'LEARNING', 'ACTIVE'),
  ('SERVICE-INTERNET', 'Internet', 'Internet, fibre and data services.', 'CONNECTIVITY', 'ACTIVE'),
  ('SERVICE-LOANS', 'Loans', 'Loan applications and lending services.', 'FINANCIAL_SERVICE', 'ACTIVE'),
  ('SERVICE-POS', 'POS', 'Point-of-sale tools for retailers and community businesses.', 'BUSINESS', 'ACTIVE'),
  ('SERVICE-TRANSPORT', 'Transport', 'Transport and ride services.', 'MOBILITY', 'ACTIVE'),
  ('SERVICE-DELIVERIES', 'Deliveries', 'Delivery and local logistics services.', 'LOGISTICS', 'ACTIVE'),
  ('SERVICE-REWARDS', 'Rewards', 'Rewards, loyalty and promotions.', 'LOYALTY', 'ACTIVE'),
  ('SERVICE-PROJECTS', 'Projects', 'Community projects and initiatives.', 'COMMUNITY', 'ACTIVE'),
  ('SERVICE-BUSINESS', 'Business Services', 'Business tools and enterprise support.', 'BUSINESS', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  service_name = VALUES(service_name),
  description = VALUES(description),
  service_type = VALUES(service_type),
  status = VALUES(status);

INSERT INTO tenant (
  tenant_id,
  tenant_name,
  company_name,
  website,
  subdomain,
  logo,
  contact_name,
  contact_email,
  contact_phone,
  country,
  status
)
VALUES
  (
    'TENANT-001',
    'Evolve',
    'Evolve Digital Communities',
    'https://evolve.duranki.com',
    'evolve.duranki.com',
    NULL,
    NULL,
    NULL,
    NULL,
    'South Africa',
    'ACTIVE'
  ),
  (
    'TENANT-003',
    'Inkolo',
    'Inkolo Communities',
    'https://inkolo.duranki.com',
    'inkolo.duranki.com',
    NULL,
    NULL,
    NULL,
    NULL,
    'South Africa',
    'ACTIVE'
  ),
  (
    'TENANT-004',
    'Trader Connect',
    'Trader Connect Communities',
    'https://traderconnect.duranki.com',
    'traderconnect.duranki.com',
    '/trader-connect-logo.png',
    NULL,
    NULL,
    NULL,
    'South Africa',
    'ACTIVE'
  ),
  (
    'TENANT-005',
    'ZUC',
    'ZUC',
    'https://www.zuc.co.za',
    'zuc.co.za',
    '/zuc-logo.png',
    NULL,
    NULL,
    NULL,
    'South Africa',
    'CONFIGURED'
  )
ON DUPLICATE KEY UPDATE
  tenant_name = VALUES(tenant_name),
  company_name = VALUES(company_name),
  website = VALUES(website),
  logo = VALUES(logo),
  country = VALUES(country),
  status = VALUES(status);

INSERT INTO community (
  community_id,
  tenant_id,
  community_name,
  community_type,
  country,
  region,
  town,
  description,
  status
)
VALUES
  (
    'COMMUNITY-001',
    'TENANT-001',
    'Asmara Community',
    'GENERAL',
    'South Africa',
    'Gauteng',
    'Johannesburg',
    'Urban community focused on marketplace, jobs, education and wallet adoption.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-002',
    'TENANT-001',
    'Grace Community Church',
    'CHURCH',
    'South Africa',
    'KwaZulu-Natal',
    'Durban',
    'Church community using services, wallet, jobs and communications.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-004',
    'TENANT-003',
    'Inkolo KZN Community',
    'CHURCH',
    'South Africa',
    'KwaZulu-Natal',
    'Durban',
    'Inkolo tenant community for members, church services, wallet, communication and projects.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-005',
    'TENANT-003',
    'Inkolo Gauteng Community',
    'CHURCH',
    'South Africa',
    'Gauteng',
    'Johannesburg',
    'Inkolo tenant community for members, marketplace, jobs, payments and communications.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-006',
    'TENANT-004',
    'eThekwini Central Traders',
    'BUSINESS',
    'South Africa',
    'KwaZulu-Natal',
    'Durban',
    'Trader district community organised into Blocks A, B, C and D for verified local traders, marketplace posts, opportunities and block chat.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-007',
    'TENANT-004',
    'KwaMashu Traders',
    'BUSINESS',
    'South Africa',
    'KwaZulu-Natal',
    'KwaMashu',
    'Trader community for KwaMashu Blocks A, B and C, focused on local trade, jobs, transport, wallet payments and business support.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-008',
    'TENANT-004',
    'Umlazi Traders',
    'BUSINESS',
    'South Africa',
    'KwaZulu-Natal',
    'Umlazi',
    'Trader community for Umlazi Blocks A, B, C and D, supporting local selling, digital payments, opportunities and services.',
    'ACTIVE'
  ),
  (
    'COMMUNITY-009',
    'TENANT-004',
    'Pinetown Traders',
    'BUSINESS',
    'South Africa',
    'KwaZulu-Natal',
    'Pinetown',
    'Trader community for Pinetown Blocks A and B, with trader discovery, local opportunities, payments and business services.',
    'ACTIVE'
  )
ON DUPLICATE KEY UPDATE
  community_name = VALUES(community_name),
  community_type = VALUES(community_type),
  country = VALUES(country),
  region = VALUES(region),
  town = VALUES(town),
  description = VALUES(description),
  status = VALUES(status);

INSERT INTO tenant_service (tenant_id, service_id, enabled)
VALUES
  ('TENANT-001', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-001', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-001', 'SERVICE-WALLET', TRUE),
  ('TENANT-001', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-001', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-001', 'SERVICE-INTERNET', TRUE),
  ('TENANT-001', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-003', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-003', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-003', 'SERVICE-WALLET', TRUE),
  ('TENANT-003', 'SERVICE-VUMA', TRUE),
  ('TENANT-003', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-003', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-003', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-003', 'SERVICE-INSURANCE', TRUE),
  ('TENANT-003', 'SERVICE-FUNERAL-COVER', TRUE),
  ('TENANT-003', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-003', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-004', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-004', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-004', 'SERVICE-WALLET', TRUE),
  ('TENANT-004', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-004', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-004', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-004', 'SERVICE-VUMA', TRUE),
  ('TENANT-004', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-004', 'SERVICE-FUNERAL-COVER', TRUE),
  ('TENANT-004', 'SERVICE-DELIVERIES', TRUE),
  ('TENANT-004', 'SERVICE-BUSINESS', TRUE),
  ('TENANT-004', 'SERVICE-POS', TRUE),
  ('TENANT-004', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-005', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-005', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-005', 'SERVICE-WALLET', TRUE),
  ('TENANT-005', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-005', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-005', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-005', 'SERVICE-INTERNET', TRUE),
  ('TENANT-005', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-005', 'SERVICE-PROJECTS', TRUE)
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled);

INSERT INTO community_service (tenant_id, community_id, service_id, enabled)
VALUES
  ('TENANT-001', 'COMMUNITY-001', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-001', 'COMMUNITY-001', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-001', 'COMMUNITY-001', 'SERVICE-WALLET', TRUE),
  ('TENANT-001', 'COMMUNITY-001', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-001', 'COMMUNITY-001', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-001', 'COMMUNITY-002', 'SERVICE-WALLET', TRUE),
  ('TENANT-001', 'COMMUNITY-002', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-001', 'COMMUNITY-002', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-001', 'COMMUNITY-002', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-WALLET', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-VUMA', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-INSURANCE', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-FUNERAL-COVER', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-003', 'COMMUNITY-004', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-WALLET', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-003', 'COMMUNITY-005', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-WALLET', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-VUMA', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-DELIVERIES', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-BUSINESS', TRUE),
  ('TENANT-004', 'COMMUNITY-006', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-WALLET', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-DELIVERIES', TRUE),
  ('TENANT-004', 'COMMUNITY-007', 'SERVICE-BUSINESS', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-WALLET', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-AIRTIME', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-ELECTRICITY', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-DELIVERIES', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-BUSINESS', TRUE),
  ('TENANT-004', 'COMMUNITY-008', 'SERVICE-PROJECTS', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-MARKETPLACE', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-JOBS-GIGS', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-WALLET', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-PAYMENTS', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-EDUCATION', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-DELIVERIES', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-BUSINESS', TRUE),
  ('TENANT-004', 'COMMUNITY-009', 'SERVICE-PROJECTS', TRUE)
ON DUPLICATE KEY UPDATE
  enabled = VALUES(enabled);

-- Administrator access must be provisioned explicitly, never inferred from a phone number.
