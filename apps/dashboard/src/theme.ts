const STORAGE_KEY = 'theme';

export type Theme = 'light' | 'dark';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

// index.htmlのインラインスクリプトと同じロジック。OS設定より明示選択を優先する。
export function currentTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return isTheme(stored) ? stored : null;
}

export function setTheme(theme: Theme | null): void {
  if (theme === null) {
    localStorage.removeItem(STORAGE_KEY);
    delete document.documentElement.dataset.theme;
    return;
  }
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.dataset.theme = theme;
}

// アカウント画面のテーマ切替UIを描画する。
export function renderThemeToggle(container: HTMLElement): void {
  const active = currentTheme();
  container.innerHTML = `
    <div class="theme-toggle" role="group" aria-label="テーマ">
      <button type="button" id="theme-system" class="${active === null ? 'active' : ''}">端末の設定に合わせる</button>
      <button type="button" id="theme-light" class="${active === 'light' ? 'active' : ''}">ライト</button>
      <button type="button" id="theme-dark" class="${active === 'dark' ? 'active' : ''}">ダーク</button>
    </div>
  `;

  const buttons = container.querySelectorAll<HTMLButtonElement>('.theme-toggle button');
  function select(theme: Theme | null): void {
    setTheme(theme);
    buttons.forEach((btn) => btn.classList.remove('active'));
    const id = theme === null ? 'theme-system' : `theme-${theme}`;
    container.querySelector(`#${id}`)!.classList.add('active');
  }

  container.querySelector('#theme-system')!.addEventListener('click', () => select(null));
  container.querySelector('#theme-light')!.addEventListener('click', () => select('light'));
  container.querySelector('#theme-dark')!.addEventListener('click', () => select('dark'));
}
