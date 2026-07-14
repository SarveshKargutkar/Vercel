/* Phoenix Hub theme switcher - modern (dark) <-> parchment */
(function(){
  let theme = 'modern';
  try{ theme = localStorage.getItem('phoenix-theme') || 'modern'; }catch(e){}
  document.documentElement.dataset.theme = theme;

  function paint(){
    const t = document.documentElement.dataset.theme;
    document.querySelectorAll('.theme-btn').forEach(b => {
      b.innerHTML = t === 'parchment' ? '&#127769; Modern' : '&#128220; Parchment';
      b.title = 'Switch theme';
    });
  }
  window.phoenixTheme = {
    toggle(){
      const nt = document.documentElement.dataset.theme === 'parchment' ? 'modern' : 'parchment';
      document.documentElement.dataset.theme = nt;
      try{ localStorage.setItem('phoenix-theme', nt); }catch(e){}
      paint();
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    // one floating toggle, top-right corner of every page
    if(!document.querySelector('.theme-btn')){
      const b = document.createElement('button');
      b.className = 'theme-btn';
      document.body.appendChild(b);
    }
    document.querySelectorAll('.theme-btn').forEach(b => b.onclick = () => window.phoenixTheme.toggle());
    paint();
  });
})();
