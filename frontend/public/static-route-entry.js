// Apache adds a slash to directory indexes. Keep the application's canonical
// path before Angular and the existing role/MFA navigation scripts execute.
(() => {
  const path = location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '') || '/';
  if (path !== location.pathname) {
    history.replaceState(history.state, '', path + location.search + location.hash);
  }
})();
