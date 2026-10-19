USE duranki_login;

ALTER TABLE member_communities
  ADD COLUMN self_change_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER branch_id,
  ADD COLUMN pending_reselect BOOLEAN NOT NULL DEFAULT FALSE AFTER self_change_count,
  ADD COLUMN last_self_change_at TIMESTAMP NULL AFTER pending_reselect;

CREATE TABLE IF NOT EXISTS community_change_requests (
  id CHAR(36) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  current_church_id BIGINT UNSIGNED NULL,
  current_branch_id BIGINT UNSIGNED NULL,
  status ENUM('PENDING', 'APPROVED', 'DECLINED', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
  email_to VARCHAR(255) NOT NULL DEFAULT 'admin@duranki.co.za',
  admin_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY ix_community_change_requests_user (user_id, created_at),
  CONSTRAINT fk_community_change_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_community_change_requests_church FOREIGN KEY (current_church_id) REFERENCES churches(id),
  CONSTRAINT fk_community_change_requests_branch FOREIGN KEY (current_branch_id) REFERENCES church_branches(id)
);
