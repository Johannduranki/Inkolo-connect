USE duranki_login;

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
