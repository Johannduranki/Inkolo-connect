USE duranki_login;

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
