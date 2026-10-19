USE duranki_login;

INSERT INTO service (service_id, service_name, description, service_type, status)
VALUES (
  'SERVICE-VUMA',
  'Vuma',
  'Vuma fibre, data and micro ISP services.',
  'CONNECTIVITY',
  'ACTIVE'
)
ON DUPLICATE KEY UPDATE
  service_name = VALUES(service_name),
  description = VALUES(description),
  service_type = VALUES(service_type),
  status = VALUES(status);

INSERT INTO tenant_service (tenant_id, service_id, enabled)
SELECT 'TENANT-003', 'SERVICE-VUMA', TRUE
FROM tenant
WHERE tenant_id = 'TENANT-003'
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);

INSERT INTO community_service (tenant_id, community_id, service_id, enabled)
SELECT 'TENANT-003', 'COMMUNITY-004', 'SERVICE-VUMA', TRUE
FROM community
INNER JOIN tenant_service
  ON tenant_service.tenant_id = community.tenant_id
  AND tenant_service.service_id = 'SERVICE-VUMA'
WHERE community.tenant_id = 'TENANT-003'
  AND community.community_id = 'COMMUNITY-004'
ON DUPLICATE KEY UPDATE enabled = VALUES(enabled);

DELETE FROM user_tenant_role
WHERE tenant_id = 'TENANT-002';

DELETE FROM user_community_role
WHERE tenant_id = 'TENANT-002'
   OR community_id = 'COMMUNITY-003';

DELETE FROM revenue_share_rule
WHERE tenant_id = 'TENANT-002'
   OR community_id = 'COMMUNITY-003';

DELETE FROM community_service
WHERE tenant_id = 'TENANT-002'
   OR community_id = 'COMMUNITY-003';

DELETE FROM tenant_service
WHERE tenant_id = 'TENANT-002';

DELETE FROM community
WHERE tenant_id = 'TENANT-002'
   OR community_id = 'COMMUNITY-003';

DELETE FROM tenant
WHERE tenant_id = 'TENANT-002'
  AND tenant_name = 'Vuma Force';
