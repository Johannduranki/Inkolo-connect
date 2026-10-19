USE duranki_login;

CREATE TABLE IF NOT EXISTS trader_training_programme (
  programme_id CHAR(36) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  community_id VARCHAR(50) NOT NULL,
  service_id VARCHAR(50) NOT NULL DEFAULT 'trader-training',
  programme_name VARCHAR(255) NOT NULL,
  programme_description TEXT NULL,
  funding_organisation VARCHAR(255) NULL,
  total_grant_amount DECIMAL(14,2) NOT NULL,
  application_start_date DATE NULL,
  application_closing_date DATE NULL,
  programme_start_date DATE NULL,
  programme_end_date DATE NULL,
  maximum_beneficiaries INT UNSIGNED NULL,
  programme_status ENUM(
    'Draft',
    'Open for Applications',
    'Applications Closed',
    'Active',
    'Suspended',
    'Completed',
    'Archived'
  ) NOT NULL DEFAULT 'Draft',
  terms_and_conditions MEDIUMTEXT NULL,
  required_documents JSON NULL,
  eligibility_requirements JSON NULL,
  initial_funding_on_approval BOOLEAN NOT NULL DEFAULT FALSE,
  initial_funding_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  default_pass_percentage DECIMAL(5,2) NOT NULL DEFAULT 100,
  unlock_rule ENUM(
    'PREVIOUS_TRAINING_COMPLETED',
    'ASSESSMENT_PASSED',
    'PREVIOUS_PAYMENT_SUCCESSFUL',
    'MANUAL_APPROVAL'
  ) NOT NULL DEFAULT 'ASSESSMENT_PASSED',
  payment_rule ENUM('AUTOMATIC_AFTER_PASS', 'ADMIN_REVIEW', 'MANUAL_ONLY') NOT NULL DEFAULT 'AUTOMATIC_AFTER_PASS',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (programme_id),
  KEY ix_trader_training_programme_scope (tenant_id, community_id, service_id),
  CONSTRAINT fk_trader_training_programme_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id),
  CONSTRAINT fk_trader_training_programme_community FOREIGN KEY (community_id) REFERENCES community(community_id),
  CONSTRAINT fk_trader_training_programme_service FOREIGN KEY (service_id) REFERENCES service(service_id)
);

CREATE TABLE IF NOT EXISTS trader_training_module (
  module_id CHAR(36) NOT NULL,
  programme_id CHAR(36) NOT NULL,
  module_sequence INT UNSIGNED NOT NULL,
  module_name VARCHAR(255) NOT NULL,
  module_description TEXT NULL,
  training_content MEDIUMTEXT NULL,
  documents JSON NULL,
  images JSON NULL,
  videos JSON NULL,
  links JSON NULL,
  instructions TEXT NULL,
  required_pass_percentage DECIMAL(5,2) NOT NULL DEFAULT 100,
  funding_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  unlock_next_automatically BOOLEAN NOT NULL DEFAULT TRUE,
  pay_automatically_after_pass BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  estimated_duration VARCHAR(100) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (module_id),
  UNIQUE KEY uq_trader_training_module_sequence (programme_id, module_sequence),
  CONSTRAINT fk_trader_training_module_programme FOREIGN KEY (programme_id) REFERENCES trader_training_programme(programme_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trader_training_question (
  question_id CHAR(36) NOT NULL,
  module_id CHAR(36) NOT NULL,
  question_sequence INT UNSIGNED NOT NULL,
  question_type ENUM('MULTIPLE_CHOICE', 'TRUE_FALSE', 'SINGLE_ANSWER') NOT NULL DEFAULT 'MULTIPLE_CHOICE',
  question_text TEXT NOT NULL,
  options JSON NOT NULL,
  correct_answer VARCHAR(500) NOT NULL,
  explanation TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (question_id),
  UNIQUE KEY uq_trader_training_question_sequence (module_id, question_sequence),
  CONSTRAINT fk_trader_training_question_module FOREIGN KEY (module_id) REFERENCES trader_training_module(module_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trader_training_application (
  application_id CHAR(36) NOT NULL,
  programme_id CHAR(36) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  community_id VARCHAR(50) NOT NULL,
  trader_id BIGINT UNSIGNED NOT NULL,
  business_name VARCHAR(255) NULL,
  motivation TEXT NULL,
  documents JSON NULL,
  status ENUM(
    'Not Applied',
    'Draft',
    'Submitted',
    'Under Review',
    'Additional Information Required',
    'Approved',
    'Rejected',
    'Suspended',
    'Completed'
  ) NOT NULL DEFAULT 'Submitted',
  initial_funding_paid BOOLEAN NOT NULL DEFAULT FALSE,
  initial_funding_reference VARCHAR(120) NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP NULL,
  reviewed_by BIGINT UNSIGNED NULL,
  completed_at TIMESTAMP NULL,
  PRIMARY KEY (application_id),
  UNIQUE KEY uq_trader_training_application_trader (programme_id, trader_id),
  KEY ix_trader_training_application_scope (tenant_id, community_id, status),
  CONSTRAINT fk_trader_training_application_programme FOREIGN KEY (programme_id) REFERENCES trader_training_programme(programme_id) ON DELETE CASCADE,
  CONSTRAINT fk_trader_training_application_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(tenant_id),
  CONSTRAINT fk_trader_training_application_community FOREIGN KEY (community_id) REFERENCES community(community_id),
  CONSTRAINT fk_trader_training_application_trader FOREIGN KEY (trader_id) REFERENCES users(id),
  CONSTRAINT fk_trader_training_application_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trader_training_assessment_attempt (
  attempt_id CHAR(36) NOT NULL,
  trader_id BIGINT UNSIGNED NOT NULL,
  programme_id CHAR(36) NOT NULL,
  module_id CHAR(36) NOT NULL,
  attempt_number INT UNSIGNED NOT NULL,
  answers JSON NOT NULL,
  score DECIMAL(5,2) NOT NULL,
  passed BOOLEAN NOT NULL,
  time_taken VARCHAR(100) NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (attempt_id),
  UNIQUE KEY uq_trader_training_attempt_number (trader_id, programme_id, module_id, attempt_number),
  KEY ix_trader_training_attempt_result (programme_id, module_id, passed, attempted_at),
  CONSTRAINT fk_trader_training_attempt_trader FOREIGN KEY (trader_id) REFERENCES users(id),
  CONSTRAINT fk_trader_training_attempt_programme FOREIGN KEY (programme_id) REFERENCES trader_training_programme(programme_id) ON DELETE CASCADE,
  CONSTRAINT fk_trader_training_attempt_module FOREIGN KEY (module_id) REFERENCES trader_training_module(module_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trader_training_payment (
  payment_id CHAR(36) NOT NULL,
  milestone_key VARCHAR(180) NOT NULL,
  trader_id BIGINT UNSIGNED NOT NULL,
  programme_id CHAR(36) NOT NULL,
  module_id CHAR(36) NULL,
  funding_amount DECIMAL(14,2) NOT NULL,
  wallet_id CHAR(36) NOT NULL,
  wallet_transaction_id CHAR(36) NULL,
  payment_date TIMESTAMP NULL,
  payment_status ENUM('Pending', 'Processing', 'Successful', 'Failed', 'Reversed') NOT NULL DEFAULT 'Pending',
  payment_reference VARCHAR(120) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  failure_reason TEXT NULL,
  retry_of_payment_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (payment_id),
  UNIQUE KEY uq_trader_training_payment_milestone (trader_id, programme_id, module_id),
  UNIQUE KEY uq_trader_training_payment_key (milestone_key),
  KEY ix_trader_training_payment_status (programme_id, payment_status),
  CONSTRAINT fk_trader_training_payment_trader FOREIGN KEY (trader_id) REFERENCES users(id),
  CONSTRAINT fk_trader_training_payment_programme FOREIGN KEY (programme_id) REFERENCES trader_training_programme(programme_id) ON DELETE CASCADE,
  CONSTRAINT fk_trader_training_payment_module FOREIGN KEY (module_id) REFERENCES trader_training_module(module_id),
  CONSTRAINT fk_trader_training_payment_wallet FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  CONSTRAINT fk_trader_training_payment_wallet_tx FOREIGN KEY (wallet_transaction_id) REFERENCES wallet_transactions(id),
  CONSTRAINT fk_trader_training_payment_retry FOREIGN KEY (retry_of_payment_id) REFERENCES trader_training_payment(payment_id)
);

INSERT INTO service (service_id, service_name, description, service_type, status)
VALUES
  ('trader-training', 'Trader Training', 'Configurable trader training, assessments and grant-linked funding milestones.', 'Learning', 'ACTIVE'),
  ('grant-distribution', 'Grant Distribution', 'Government grant distribution, tracking and reconciliation.', 'Public funding', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  service_name = VALUES(service_name),
  description = VALUES(description),
  service_type = VALUES(service_type),
  status = VALUES(status);
