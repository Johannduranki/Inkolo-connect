(() => {
  if(!document.querySelector('script[data-admin-layout],script[src="/admin-layout.js"]')){const script=document.createElement('script');script.src='/admin-layout.js';script.dataset.adminLayout='true';document.head.append(script);}
  function arrange() {
    if (!['/dashboard/member', '/dashboard/platform-admin'].includes(location.pathname)) return;
    const header = document.querySelector('header');
    if (!header) return;
    let nav = header.querySelector('[data-dashboard-links]');
    const links = [...header.children].filter(node => node.tagName === 'A' && node.getAttribute('href') !== '/dashboard' && !node.querySelector('img'));
    if (!nav && links.length) {
      nav = document.createElement('nav');
      nav.dataset.dashboardLinks = 'true';
      nav.setAttribute('aria-label', 'Dashboard shortcuts');
      header.append(nav);
    }
    if (!nav) return;
    for (const link of links) nav.append(link);
    // Member service entry points belong in the subscription cards, not shortcuts.
    const memberDashboard = location.pathname === '/dashboard/member';
    if (nav.hidden !== memberDashboard) nav.hidden = memberDashboard;
    nav.style.setProperty('display', memberDashboard ? 'none' : 'flex', 'important');
    // Keep injected link markers intact; hide duplicate destinations without recreating them.
    const destinations = new Set();
    for (const link of nav.children) {
      const url = new URL(link.href, location.href);
      const destination = url.pathname === '/payments/cycle' ? url.pathname : url.href;
      const duplicate = destinations.has(destination);
      if (link.hidden !== duplicate) link.hidden = duplicate;
      destinations.add(destination);
    }
  }
  new MutationObserver(arrange).observe(document.body, { childList: true, subtree: true });
  arrange();
})();
