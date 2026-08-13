import { confirmPasswordReset, googleLoginUrl, login, requestPasswordReset, signup } from './api';
import { escapeHtml } from 'shared';

type Mode = 'login' | 'signup' | 'forgot';

// design.md §3「未ログイン時: トップページ」対応。ログイン成功時はonAuthenticatedを呼ぶ
// (画面遷移はmain.ts側が担い、この関数自体はページ遷移を行わない)。
export function renderAuthScreen(container: HTMLElement, onAuthenticated: () => void): void {
  let mode: Mode = 'login';

  function draw(): void {
    container.innerHTML = `
      <div class="auth-screen">
        <h1>たまちゃんの筋トレ管理</h1>
        <p class="auth-lead">筋トレの記録・進捗をどこからでも管理できます。</p>
        <a class="google-btn" href="${googleLoginUrl}">Googleでログイン</a>
        <p class="auth-or">または</p>
        <div class="auth-tabs" role="group">
          <button type="button" class="auth-tab ${mode === 'login' ? 'active' : ''}" data-mode="login">ログイン</button>
          <button type="button" class="auth-tab ${mode === 'signup' ? 'active' : ''}" data-mode="signup">新規登録</button>
        </div>
        ${mode === 'forgot' ? renderForgotForm() : renderCredentialsForm(mode)}
      </div>
    `;

    container.querySelectorAll<HTMLButtonElement>('.auth-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode as Mode;
        draw();
      });
    });

    if (mode === 'forgot') {
      bindForgotForm();
    } else {
      bindCredentialsForm(mode);
    }
  }

  function renderCredentialsForm(currentMode: Mode): string {
    return `
      <form id="credentials-form">
        ${currentMode === 'signup' ? '<label>表示名 <input type="text" id="display-name" required /></label>' : ''}
        <label>メールアドレス <input type="email" id="email" required /></label>
        <label>パスワード <input type="password" id="password" minlength="8" required /></label>
        <button type="submit">${currentMode === 'signup' ? '登録する' : 'ログイン'}</button>
        ${currentMode === 'login' ? '<button type="button" id="forgot-link" class="link-button">パスワードを忘れた方</button>' : ''}
        <p id="auth-status"></p>
      </form>
    `;
  }

  function bindCredentialsForm(currentMode: Mode): void {
    container.querySelector('#forgot-link')?.addEventListener('click', () => {
      mode = 'forgot';
      draw();
    });

    const formEl = container.querySelector<HTMLFormElement>('#credentials-form')!;
    const statusEl = container.querySelector<HTMLParagraphElement>('#auth-status')!;
    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = container.querySelector<HTMLInputElement>('#email')!.value;
      const password = container.querySelector<HTMLInputElement>('#password')!.value;
      const submitBtn = formEl.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submitBtn.disabled = true;
      statusEl.textContent = '';
      try {
        if (currentMode === 'signup') {
          const displayName = container.querySelector<HTMLInputElement>('#display-name')!.value;
          await signup(email, password, displayName);
        } else {
          await login(email, password);
        }
        onAuthenticated();
      } catch (err) {
        statusEl.textContent = String(err instanceof Error ? err.message : err);
        submitBtn.disabled = false;
      }
    });
  }

  function renderForgotForm(): string {
    return `
      <form id="forgot-form">
        <label>メールアドレス <input type="email" id="forgot-email" required /></label>
        <button type="submit">再設定メールを送る</button>
        <button type="button" id="back-to-login" class="link-button">ログインに戻る</button>
        <p id="forgot-status"></p>
      </form>
    `;
  }

  function bindForgotForm(): void {
    container.querySelector('#back-to-login')!.addEventListener('click', () => {
      mode = 'login';
      draw();
    });

    const formEl = container.querySelector<HTMLFormElement>('#forgot-form')!;
    const statusEl = container.querySelector<HTMLParagraphElement>('#forgot-status')!;
    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const email = container.querySelector<HTMLInputElement>('#forgot-email')!.value;
      const submitBtn = formEl.querySelector<HTMLButtonElement>('button[type="submit"]')!;
      submitBtn.disabled = true;
      try {
        await requestPasswordReset(email);
        statusEl.textContent = 'メールを送信しました。届いたリンクから新しいパスワードを設定してください。';
      } catch (err) {
        statusEl.textContent = String(err instanceof Error ? err.message : err);
        submitBtn.disabled = false;
      }
    });
  }

  draw();
}

// design.md §2.10「password_reset_confirm」対応。トップページとは別の画面として、
// URLの?tokenパラメータを受け取って新しいパスワードを設定させる(main.tsがパスで出し分ける)。
export function renderPasswordResetConfirm(container: HTMLElement, token: string, onDone: () => void): void {
  container.innerHTML = `
    <div class="auth-screen">
      <h1>パスワードの再設定</h1>
      <form id="reset-confirm-form">
        <label>新しいパスワード <input type="password" id="new-password" minlength="8" required /></label>
        <button type="submit">パスワードを変更する</button>
        <p id="reset-status"></p>
      </form>
    </div>
  `;

  const formEl = container.querySelector<HTMLFormElement>('#reset-confirm-form')!;
  const statusEl = container.querySelector<HTMLParagraphElement>('#reset-status')!;
  formEl.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const newPassword = container.querySelector<HTMLInputElement>('#new-password')!.value;
    const submitBtn = formEl.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    submitBtn.disabled = true;
    try {
      await confirmPasswordReset(token, newPassword);
      statusEl.textContent = 'パスワードを変更しました。ログインしてください。';
      setTimeout(onDone, 1500);
    } catch (err) {
      statusEl.textContent =
        String(err instanceof Error ? err.message : err) === 'invalid_or_expired_token'
          ? escapeHtml('リンクの有効期限が切れています。もう一度パスワード再設定をリクエストしてください。')
          : String(err instanceof Error ? err.message : err);
      submitBtn.disabled = false;
    }
  });
}
