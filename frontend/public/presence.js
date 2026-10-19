(() => {
  if(!document.querySelector('script[data-cycle-billing]')){const script=document.createElement('script');script.src='/cycle-billing-link.js';script.dataset.cycleBilling='true';document.head.append(script);}
  if(!document.querySelector('script[data-catalogue-status]')){const script=document.createElement('script');script.src='/catalogue-status.js';script.dataset.catalogueStatus='true';document.head.append(script);}
  if(!document.querySelector('script[data-community-registration]')){const script=document.createElement('script');script.src='/community-registration-link.js';script.dataset.communityRegistration='true';document.head.append(script);}
  if(!document.querySelector('script[data-trader-training-navigation]')){const script=document.createElement('script');script.src='/trader-training-navigation.js';script.dataset.traderTrainingNavigation='true';document.head.append(script);}
  if(!document.querySelector('script[data-admin-layout]')){const layout=document.createElement('script');layout.src='/admin-layout.js';layout.dataset.adminLayout='true';document.head.append(layout);}
  const switcher = document.createElement('script');
  switcher.type = 'module'; switcher.src = '/dashboard-switcher.js';
  document.head.append(switcher);
  const tenantNavigation = document.createElement('script');
  tenantNavigation.src = '/tenant-access-link.js';
  document.head.append(tenantNavigation);
  const navigation = document.createElement('script');
  navigation.type = 'module'; navigation.src = '/admin-navigation.js';
  document.head.append(navigation);
  let token = '', busy = false, lastBeat = 0, snapshot = null, unavailable = false;
  const style = document.createElement('style');
  style.textContent = `
    .online-speedometer-panel{display:none!important}
    [data-live-presence]{box-sizing:border-box;width:min(calc(100% - 2rem),84rem);margin:20px auto;padding:24px 0;border-block:1px solid #c8ded6;display:grid;grid-template-columns:minmax(0,1fr) minmax(240px,360px);align-items:center;gap:24px}
    [data-live-presence] h2{margin:0 0 8px;font-size:24px;line-height:1.25}
    [data-live-presence] p{margin:0;line-height:1.5}
    [data-live-presence] .presence-metrics{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:baseline;gap:8px 12px;min-width:0}
    [data-live-presence] strong{font-size:36px;line-height:1.2;font-variant-numeric:tabular-nums}
    [data-live-presence] meter{grid-column:1/-1;width:100%;height:20px;min-width:0}
    [data-real-data-notice]{box-sizing:border-box;width:min(calc(100% - 2rem),84rem);margin:16px auto;line-height:1.5}
    @media(max-width:700px){[data-live-presence]{grid-template-columns:1fr;gap:16px}}
  `;
  document.head.append(style);
  function render() {
    const existing = document.querySelector('[data-live-presence]');
    if (location.pathname !== '/dashboard/platform-admin' || !token) { existing?.remove(); return; }
    const anchor = document.querySelector('.summary-grid');
    if (!anchor) return;
    const panel = existing || document.createElement('section');
    panel.dataset.livePresence = 'true';
    panel.setAttribute('aria-label', 'Measured platform activity');
    const signature = JSON.stringify([snapshot, unavailable]);
    if (panel.dataset.snapshot === signature) return;
    panel.dataset.snapshot = signature;
    panel.replaceChildren();
    const label = document.createElement('div'), title = document.createElement('h2'), hint = document.createElement('p');
    title.textContent = 'Users online';
    hint.textContent = 'Unique signed-in users active within the last 90 seconds.';
    label.append(title, hint); panel.append(label);
    const count = document.createElement('strong');
    count.textContent = unavailable ? 'Unavailable' : snapshot ? String(snapshot.onlineUsers) : 'Loading';
    const metrics=document.createElement('div');metrics.className='presence-metrics';
    metrics.append(count);panel.append(metrics);
    if (snapshot && !unavailable) {
      const total = document.createElement('span'), meter = document.createElement('meter');
      total.textContent = `of ${snapshot.totalUsers} registered users`;
      meter.min = 0; meter.max = Math.max(1, snapshot.totalUsers); meter.value = snapshot.onlineUsers;
      meter.setAttribute('aria-label', `${snapshot.onlineUsers} online out of ${snapshot.totalUsers} registered users`);
      metrics.append(total, meter);
    }
    if (!existing) anchor.after(panel);
  }
  async function update() {
    const current = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token') || '';
    if (current !== token || location.pathname === '/login') {
      if (token) fetch('/api/presence/session', {method:'DELETE',headers:{Authorization:'Bearer '+token},keepalive:true}).catch(()=>{});
      token = location.pathname === '/login' ? '' : current;
      snapshot = null; lastBeat = 0;
    }
    render();
    if (!token || document.hidden || busy || Date.now() - lastBeat < 30000) return;
    busy = true; lastBeat = Date.now(); const activeToken = token;
    try {
      const headers = {Authorization:'Bearer '+activeToken};
      const heartbeat = await fetch('/api/presence/heartbeat',{method:'POST',headers,cache:'no-store'});
      if (!heartbeat.ok) throw new Error('Heartbeat failed');
      if (location.pathname === '/dashboard/platform-admin') {
        const response = await fetch('/api/presence/summary',{headers,cache:'no-store'});
        if (!response.ok) throw new Error('Presence unavailable');
        const result = await response.json();
        if (token === activeToken) {snapshot = result; unavailable = false;}
      }
    } catch { if (token === activeToken) {snapshot = null; unavailable = true;} }
    finally {busy = false; render();}
  }
  // The observer only places the widget; polling owns network activity.
  new MutationObserver(render).observe(document.body,{childList:true,subtree:true});
  setInterval(update,5000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){lastBeat=0;update();}});
  if(!document.querySelector('script[data-entity-branding]')){const script=document.createElement('script');script.src='/branding-display.js';script.dataset.entityBranding='true';document.body.append(script);}
  update();
})();
