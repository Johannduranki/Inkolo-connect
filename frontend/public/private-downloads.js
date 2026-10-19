document.addEventListener('click', async event => {
  const link = event.target.closest?.('a[href]');
  if (!link) return;
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith('/uploads/') || url.pathname.startsWith('/uploads/community-logos/')) return;
  event.preventDefault();
  const token = sessionStorage.getItem('duranki_access_token');
  if (!token) { alert('Sign in again to download this document.'); return; }
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('Unavailable');
    const objectUrl = URL.createObjectURL(await response.blob());
    const download = document.createElement('a');
    download.href = objectUrl;
    download.download = link.download || url.pathname.split('/').pop() || 'document';
    download.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch { alert('This document is unavailable or you do not have permission to download it.'); }
}, true);
