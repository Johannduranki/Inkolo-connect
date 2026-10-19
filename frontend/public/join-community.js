(() => {
  const $ = id => document.getElementById(id);
  let communities = [], busy = false;
  async function api(body) {
    const token = sessionStorage.getItem('duranki_access_token') || localStorage.getItem('duranki_access_token');
    const response = await fetch('/api/community-registration', {method:body?'POST':'GET',cache:'no-store',
      headers:{Authorization:'Bearer '+(token || ''),'Content-Type':'application/json'}, body:body?JSON.stringify(body):undefined});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        $('signin').hidden = false; $('join-form').hidden = true;
      }
      throw Error(data.message || 'Community registration is unavailable.');
    }
    return data;
  }
  function selection() {
    const c = communities.find(c => c.id === $('community').value);
    $('join').disabled = busy || !c || c.joined;
    $('open').hidden = !c?.joined;
    if (c?.joined) {
      $('open').href = '/community?communityId='+encodeURIComponent(c.memberCommunityId);
      $('status').textContent = 'You are already a member of '+c.name+'.';
    } else $('status').textContent = c ? 'Register with your existing Duranki account.' : 'No communities are currently available.';
  }
  $('community').onchange = selection;
  $('signin').onclick = () => sessionStorage.setItem('duranki_join_after_login','true');
  $('join-form').onsubmit = async event => {
    event.preventDefault(); if (busy) return;
    busy = true; $('join').disabled = true; $('status').textContent = 'Registering...';
    try {
      const result = await api({communityId:$('community').value});
      const c = communities.find(c => c.id === $('community').value); c.joined = true;
      c.memberCommunityId = result.membership.communityId || result.membership.churchId;
      $('roles').textContent = 'Your roles: '+result.roles.join(', ');
      selection(); $('status').textContent = result.alreadyMember ? 'You are already registered in this community.' : 'Registration complete. Your other roles and memberships are unchanged.';
    } catch(error) { $('status').textContent = error.message; }
    finally { busy = false; $('join').disabled = !!communities.find(c => c.id === $('community').value)?.joined; }
  };
  api().then(data => {
    sessionStorage.removeItem('duranki_join_after_login');
    communities = data.communities;
    $('roles').textContent = 'Your roles: '+data.roles.join(', ');
    if (data.roles.includes('Platform Admin') || data.roles.includes('DURANKI_ADMIN')) $('return').href = '/dashboard/platform-admin';
    for (const c of communities) {
      const option = document.createElement('option'); option.value = c.id;
      option.textContent = c.tenantName+' - '+c.name+(c.joined?' (Already a member)':''); $('community').append(option);
    }
    $('join-form').hidden = false; selection();
  }).catch(error => { $('status').textContent = error.message; });
})();
