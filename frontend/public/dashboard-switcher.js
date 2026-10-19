import { installTenantOperations } from './tenant-operations.js';

export function isTradingCommunity(id, name = '') {
  return ['trader-ilembe','community-ilembe-traders'].includes(id) || /^(Traders KZN|Trader Connect)$/i.test(name.trim());
}

export function applyCommunityIdentity(doc, currentUrl) {
  const url=new URL(currentUrl);
  if(url.pathname!=='/community')return;
  const hero=doc.querySelector('.church-hero');if(!hero)return;
  const trading=isTradingCommunity(url.searchParams.get('communityId'),hero.querySelector('h1')?.textContent||'');
  const mark=hero.querySelector('.church-mark');
  if(mark){if(trading)mark.style.setProperty('display','none','important');else mark.style.removeProperty('display');}
  const subtitle=hero.querySelector('.hero-content > span');
  if(subtitle){
    if(!subtitle.dataset.originalCommunityCopy)subtitle.dataset.originalCommunityCopy=subtitle.textContent;
    const copy=trading?'Supporting traders and small businesses with training, funding opportunities and community services.':subtitle.dataset.originalCommunityCopy;
    if(subtitle.textContent!==copy)subtitle.textContent=copy;
  }
  for(const node of doc.querySelectorAll('.church-selector p,.church-selector span,.church-selector option')){
    if(!node.dataset.originalCommunityCopy)node.dataset.originalCommunityCopy=node.textContent;
    const copy=trading?node.dataset.originalCommunityCopy.replace(/KZNCC CHURCH DIRECTORY/g,'TRADER COMMUNITY').replace(/church/gi,'community'):node.dataset.originalCommunityCopy;
    if(node.textContent!==copy)node.textContent=copy;
  }
}

export function destinationValue(pathname, search, values) {
  const params = new URLSearchParams(search);
  const communityId = params.get('communityId');
  if (pathname === '/community' || pathname === '/dashboard/member') {
    const member = communityId ? '__community:' + communityId : pathname === '/community' ? '__member-services' : 'Member';
    return values.includes(member) ? member : '';
  }
  const admin = 'admin:' + pathname + search;
  if (values.includes(admin)) return admin;
  const roles = { '/dashboard/platform-admin': 'Platform Admin', '/dashboard/accounting': 'Accountant', '/dashboard/treasury': 'Treasury Admin' };
  return values.includes(roles[pathname]) ? roles[pathname] : null;
}

export function synchronizeSwitcher(select, location) {
  const desired = destinationValue(location.pathname, location.search, [...select.options].map(o => o.value));
  if (desired !== null && select.value !== desired) select.value = desired;
}

export function scopedMemberLink(href, currentUrl) {
  const current = new URL(currentUrl);
  const target = new URL(href, current);
  const memberPaths = ['/community', '/dashboard/member', '/dashboard'];
  if (target.origin !== current.origin || !memberPaths.includes(current.pathname) ||
      !memberPaths.includes(target.pathname) || target.searchParams.has('communityId')) return target.href;
  const communityId = current.searchParams.get('communityId');
  if (communityId) {
    target.searchParams.set('communityId', communityId);
    if (target.pathname === '/dashboard') target.pathname = '/dashboard/member';
  }
  return target.href;
}

if (typeof document !== 'undefined') {
  const sync = () => {
    installTenantOperations(document, location);
    applyCommunityIdentity(document, location.href);
    if (['/community','/dashboard/member'].includes(location.pathname)) {
      const header=document.querySelector('header');
      if(header&&header.querySelector('app-role-switcher')&&!header.querySelector('[data-cycle-pay]')){
        const link=document.createElement('a');link.dataset.cyclePay='true';link.href='/payments/cycle';link.textContent='My payments';link.style.cssText='padding:10px;color:#166853;font-weight:600';header.append(link);
      }
    } else document.querySelector('[data-cycle-pay]')?.remove();
    document.querySelectorAll('app-role-switcher select').forEach(select => synchronizeSwitcher(select, location));
    if (location.pathname === '/dashboard/platform-admin') {
      const params = new URLSearchParams(location.search);
      const selected = params.get('tenantId') || params.get('communityId');
      if (selected) document.querySelectorAll('select').forEach(select => {
        if (select !== document.activeElement && [...select.options].some(option => option.value === selected) && select.value !== selected) select.value = selected;
      });
    }
    document.querySelectorAll('a[href]').forEach(link => {
      const scoped = scopedMemberLink(link.href, location.href);
      if (scoped !== link.href) link.href = scoped;
    });
    const placeholders = document.querySelector('.community-layout');
    if (placeholders && !document.querySelector('[data-community-unconfigured]')) {
      placeholders.hidden = true;
      placeholders.style.display = 'none';
      const status = document.createElement('section');
      status.dataset.communityUnconfigured = 'true';
      status.style.cssText = 'padding:24px 0';
      const heading = document.createElement('h2');
      heading.textContent = 'Community information';
      const note = document.createElement('p');
      note.textContent = 'Events and contact information are not configured yet.';
      status.append(heading, note);
      placeholders.after(status);
    }
    if (location.pathname === '/dashboard/accounting') {
      const main = document.querySelector('main');
      if (main && !document.querySelector('[data-accounting-limitations]')) {
        const note = document.createElement('p');
        note.dataset.accountingLimitations = 'true';
        note.setAttribute('role','status');
        note.textContent = 'Recorded ledger totals only, not verified bank balances. Payments, invoice posting and bank reconciliation are not connected. Employee costs and short codes can be saved.';
        note.style.cssText = 'padding:16px 24px;border-bottom:1px solid #d4bd87;background:#fff8e5;color:#654c0e;line-height:1.5';
        main.prepend(note);
      }
      document.querySelectorAll('.performance .chart, .performance .legend, .close-status > div').forEach(node => { node.hidden = true; node.style.display = 'none'; });
      const performance = document.querySelector('.performance');
      if (performance && !performance.querySelector('[data-chart-unavailable]')) {
        const note = document.createElement('p');
        note.dataset.chartUnavailable = 'true';
        note.textContent = 'Monthly comparisons are unavailable until verified transactions are connected.';
        performance.append(note);
      }
    }
  };
  // Reload scoped member routes so the older compiled Angular component cannot
  // retain data from the previously selected community.
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return;
    const target = new URL(scopedMemberLink(link.href, location.href));
    if (target.origin !== location.origin || !['/community','/dashboard/member'].includes(target.pathname) || !target.searchParams.has('communityId')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(target.href);
  }, true);
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', sync);
  // Angular can update a select property without changing DOM attributes.
  setInterval(() => { if (!document.activeElement?.matches('app-role-switcher select')) sync(); }, 500);
  sync();
}
