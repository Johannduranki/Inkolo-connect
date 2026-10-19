const sections = {'Tenant details':'TENANT DETAILS','Tenant website':'TENANT WEBSITE','Enabled services':'ENABLED SERVICES',Communities:'TENANT COMMUNITIES',Settings:'TENANT DETAILS'};

export function tenantOperation(area, tenantId) {
  if (!tenantId) return { unavailable: 'Select a tenant first.' };
  if (area === 'Reports') return { href: '/dashboard/community-reports?tenantId=' + encodeURIComponent(tenantId) };
  if (sections[area]) return { section: sections[area], edit: area === 'Settings' };
  if (area === 'Users') return { href: '/dashboard/tenant?tenantId=' + encodeURIComponent(tenantId) };
  if (area === 'Transactions') return { href: '/dashboard/cycle?tenantId=' + encodeURIComponent(tenantId) };
  return { unavailable: area === 'Revenue' ? 'Tenant revenue reporting is not connected to reconciled financial records yet.' : 'Tenant report generation is not connected yet.' };
}

export function installTenantOperations(doc, location) {
  if (location.pathname !== '/dashboard/platform-admin') return;
  if (!doc.querySelector('[data-tenant-operation-style]')) {
    const style=doc.createElement('style');style.dataset.tenantOperationStyle='true';
    style.textContent='.module-grid.inline article:has(.tenant-operation){padding:0!important;overflow:hidden;border-radius:8px}.module-grid.inline .tenant-operation{width:100%;min-height:84px;padding:16px!important;display:grid;gap:8px;text-align:left;border:0!important;border-radius:8px;background:#fff!important;color:#123b55!important;cursor:pointer;box-shadow:none!important;letter-spacing:0}.tenant-operation strong{font-size:18px}.tenant-operation:disabled{cursor:not-allowed;background:#f4f6f7!important;color:#65737a!important}.tenant-operation:not(:disabled):hover{outline:2px solid #197c85;outline-offset:-2px}.tenant-operation:focus-visible{outline:3px solid #197c85;outline-offset:-3px}';
    doc.head.append(style);
  }
  const heading = [...doc.querySelectorAll('h2')].find(node => node.textContent.trim() === 'Operational areas');
  const grid = heading?.closest('article')?.querySelector('.module-grid');
  if (!grid) return;
  const tenantId = new URLSearchParams(location.search).get('tenantId');
  for (const tile of grid.children) {
    const area = tile.querySelector('span')?.textContent.trim();
    if (!area) continue;
    let button = tile.querySelector('button');
    if (!button) {
      button = doc.createElement('button');button.type = 'button';
      const label = doc.createElement('span'), action = doc.createElement('strong');
      label.textContent = area;button.append(label, action);tile.replaceChildren(button);
    }
    button.classList.add('tenant-operation');
    const target = tenantOperation(area, tenantId), text = target.unavailable ? 'Not connected' : 'Open';
    if (button.querySelector('strong').textContent !== text) button.querySelector('strong').textContent = text;
    button.disabled = !!target.unavailable;
    button.title = target.unavailable || (area === 'Users' ? 'Open tenant users and permissions' : 'Open ' + area.toLowerCase());
    button.setAttribute('aria-label', area + (target.unavailable ? ': not connected' : ': open'));
    if (button.dataset.operationBound) continue;
    button.dataset.operationBound = 'true';
    button.addEventListener('click', () => {
      const destination = tenantOperation(area, new URLSearchParams(location.search).get('tenantId'));
      if (destination.href) { location.assign(destination.href); return; }
      if (destination.section) {
        const label = [...doc.querySelectorAll('article.panel p')].find(node => node.textContent.trim() === destination.section);
        const panel = label?.closest('article.panel');
        if (!panel) return;
        if (destination.edit) {
          const edit = [...panel.querySelectorAll('button')].find(node => node.textContent.trim() === 'Edit Tenant');
          if (edit) { edit.click(); return; }
        }
        panel.tabIndex = -1;panel.scrollIntoView({ behavior: 'smooth', block: 'start' });panel.focus({ preventScroll: true });
      }
    });
  }
}
