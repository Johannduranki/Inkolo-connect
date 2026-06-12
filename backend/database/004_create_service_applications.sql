USE duranki_login;

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
