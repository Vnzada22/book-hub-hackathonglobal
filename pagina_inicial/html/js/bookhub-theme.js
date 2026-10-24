(function () {
  const storageKey = 'bookhub-theme';
  const root = document.documentElement;

  function readTheme() {
    try {
      const savedTheme = localStorage.getItem(storageKey);
      return savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : 'light';
    } catch (error) {
      console.error('Não foi possível carregar a preferência de tema do BookHub.', error);
      return 'light';
    }
  }

  function applyTheme(theme, persist = false) {
    root.dataset.theme = theme;
    if (persist) {
      try {
        localStorage.setItem(storageKey, theme);
      } catch (error) {
        console.error('Não foi possível salvar a preferência de tema do BookHub.', error);
      }
    }
  }

  applyTheme(readTheme());

  document.addEventListener('DOMContentLoaded', () => {
    const header = document.querySelector('.nav-right')
      || document.querySelector('.header-right')
      || document.querySelector('.login-header')
      || document.querySelector('.netflix-header');
    if (!header) {
      console.error('Não foi possível encontrar o cabeçalho para exibir o seletor de tema.');
      return;
    }

    const button = document.createElement('button');
    button.className = 'bookhub-theme-toggle';
    button.type = 'button';
    button.innerHTML = `
      <svg class="theme-icon theme-icon-moon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20.3 15.1A8.5 8.5 0 0 1 8.9 3.7 8.5 8.5 0 1 0 20.3 15.1Z"></path>
      </svg>
      <svg class="theme-icon theme-icon-sun" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4"></circle>
        <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"></path>
      </svg>
      <span></span>
    `;

    function updateButton() {
      const isDark = root.dataset.theme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute('aria-label', `Ativar modo ${isDark ? 'claro' : 'escuro'}`);
      button.title = `Ativar modo ${isDark ? 'claro' : 'escuro'}`;
      button.querySelector('span').textContent = isDark ? 'Claro' : 'Escuro';
    }

    updateButton();
    button.addEventListener('click', () => {
      applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
      updateButton();
    });

    header.append(button);
  });
})();
