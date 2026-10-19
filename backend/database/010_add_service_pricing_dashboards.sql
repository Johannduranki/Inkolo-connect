USE duranki_login;

CREATE TABLE IF NOT EXISTS service_pricing (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id VARCHAR(40) NOT NULL,
  tenant_id VARCHAR(40) NULL,
  community_id VARCHAR(40) NULL,
  price DECIMAL(14,2) NOT NULL DEFAULT 0.00,
  currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  billing_period ENUM('ONCE_OFF', 'MONTHLY', 'PER_TRANSACTION') NOT NULL DEFAULT 'MONTHLY',
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_pricing_scope (service_id, tenant_id, community_id, billing_period, effective_from),
  KEY ix_service_pricing_service (service_id, status),
  KEY ix_service_pricing_tenant (tenant_id, status),
  KEY ix_service_pricing_community (tenant_id, community_id, status),
  CONSTRAINT fk_service_pricing_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_service_pricing_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_service_pricing_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS service_dashboard (
  service_id VARCHAR(40) NOT NULL,
  dashboard_name VARCHAR(150) NOT NULL,
  dashboard_route VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (service_id),
  UNIQUE KEY uq_service_dashboard_route (dashboard_route),
  CONSTRAINT fk_service_dashboard_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS service_dashboard_admin (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  service_id VARCHAR(40) NOT NULL,
  tenant_id VARCHAR(40) NULL,
  community_id VARCHAR(40) NULL,
  user_id BIGINT UNSIGNED NULL,
  admin_name VARCHAR(150) NOT NULL,
  admin_email VARCHAR(255) NOT NULL,
  admin_phone VARCHAR(40) NULL,
  scope ENUM('PLATFORM', 'TENANT', 'COMMUNITY') NOT NULL DEFAULT 'TENANT',
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_service_dashboard_admin_email (service_id, tenant_id, community_id, admin_email),
  KEY ix_service_dashboard_admin_service (service_id, scope, status),
  KEY ix_service_dashboard_admin_user (user_id),
  CONSTRAINT fk_service_dashboard_admin_service
    FOREIGN KEY (service_id) REFERENCES service(service_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_service_dashboard_admin_tenant
    FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_service_dashboard_admin_community
    FOREIGN KEY (tenant_id, community_id) REFERENCES community(tenant_id, community_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_service_dashboard_admin_user
    FOREIGN KEY (user_id) REFERENCES users(id)
    ON DELETE SET NULL
);

INSERT INTO service_dashboard (service_id, dashboard_name, dashboard_route, description)
SELECT service_id, CONCAT(service_name, ' Dashboard'), CONCAT('/dashboard/services/', LOWER(REPLACE(service_name, ' ', '-'))), description
FROM service
ON DUPLICATE KEY UPDATE
  dashboard_name = VALUES(dashboard_name),
  description = VALUES(description);

INSERT INTO service_pricing (service_id, price, currency, billing_period, effective_from)
VALUES
  ('SERVICE-MARKETPLACE', 49.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-JOBS-GIGS', 39.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-AIRTIME', 0.00, 'ZAR', 'PER_TRANSACTION', '2026-01-01'),
  ('SERVICE-ELECTRICITY', 0.00, 'ZAR', 'PER_TRANSACTION', '2026-01-01'),
  ('SERVICE-PAYMENTS', 0.00, 'ZAR', 'PER_TRANSACTION', '2026-01-01'),
  ('SERVICE-WALLET', 0.00, 'ZAR', 'PER_TRANSACTION', '2026-01-01'),
  ('SERVICE-VUMA', 99.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-INTERNET', 99.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-INSURANCE', 29.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-EDUCATION', 59.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-FUNERAL-COVER', 35.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-LOANS', 0.00, 'ZAR', 'PER_TRANSACTION', '2026-01-01'),
  ('SERVICE-POS', 149.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-TRANSPORT', 49.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-DELIVERIES', 49.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-REWARDS', 25.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-BUSINESS', 79.00, 'ZAR', 'MONTHLY', '2026-01-01'),
  ('SERVICE-PROJECTS', 25.00, 'ZAR', 'MONTHLY', '2026-01-01')
ON DUPLICATE KEY UPDATE
  price = VALUES(price),
  currency = VALUES(currency),
  billing_period = VALUES(billing_period),
  status = 'ACTIVE';
