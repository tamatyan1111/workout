import './style.css';
import { getCycles, getMe, UnauthorizedError } from './api';
import { renderAuthScreen, renderPasswordResetConfirm } from './auth';
import { renderOnboarding } from './onboarding';
import { renderDashboard } from './dashboard';
import { renderSharedRecipe } from './sharedRecipe';
import { escapeHtml } from 'shared';

const app = document.querySelector<HTMLDivElement>('#app')!;

// design.md §3: パスワードリセットのリンク(/?reset_token=...)は、通常の
// ログイン/ダッシュボード分岐より先に判定する(未ログイン状態でも到達できる必要があるため)。
// 専用のパス(/reset-password)ではなくルート直下のクエリパラメータにしているのは、
// ルートは常に実ファイルのindex.htmlであり、Service WorkerのSPAナビゲーション
// フォールバックを一切必要としないため(design.md §1.1・vite.config.ts参照)。
function handleResetPasswordRoute(): boolean {
  const token = new URLSearchParams(window.location.search).get('reset_token');
  if (!token) return false;

  renderPasswordResetConfirm(app, token, () => {
    window.location.href = '/';
  });
  return true;
}

// design.md §2.19: レシピの共有リンク(/?share_recipe=...)も同じ理由でログイン判定より先に処理する。
// パラメータ名を"token"ではなく"share_recipe"にしているのは、他のトークン系ルート(reset_token等)と
// URL上で見分けやすくするため。
function handleSharedRecipeRoute(): boolean {
  const token = new URLSearchParams(window.location.search).get('share_recipe');
  if (!token) return false;

  renderSharedRecipe(app, token);
  return true;
}

// design.md §3: 未ログイン → ログイン/サインアップ画面、ログイン済みでサイクル未設定 →
// オンボーディング、それ以外 → 通常のダッシュボード、の3状態を出し分ける
async function boot(): Promise<void> {
  if (handleResetPasswordRoute()) return;
  if (handleSharedRecipeRoute()) return;

  try {
    const profile = await getMe();
    const cycles = await getCycles();
    if (cycles.length === 0) {
      renderOnboarding(app, () => void boot());
      return;
    }
    renderDashboard(app, profile.display_name, () => void boot());
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      renderAuthScreen(app, () => void boot());
      return;
    }
    app.innerHTML = `<p class="error">読み込みに失敗しました: ${escapeHtml(String(err instanceof Error ? err.message : err))}</p>`;
  }
}

void boot();
