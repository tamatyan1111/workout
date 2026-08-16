import { deleteAccount, getMe, updateMe } from './api';
import { renderThemeToggle } from './theme';
import type { Profile } from './types';
import { escapeHtml } from 'shared';
import type { ActivityLevel, Gender } from 'shared';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const GENDER_LABELS: Record<Gender, string> = {
  male: '男性',
  female: '女性',
  unspecified: '回答しない',
};

// nutrition_calc.php ACTIVITY_LEVEL_FACTORSと対応(design.md §2.11)。profileSummary.tsでも使う。
export const ACTIVITY_LEVEL_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'デスクワーク中心・ほぼ運動しない',
  light: '軽い運動習慣(週1〜3日)',
  moderate: '立ち仕事や中程度の運動(週3〜5日)',
  active: '激しい運動習慣(週6〜7日)',
};

// プロフィールタブのサマリー(profileSummary.ts)は他のstat-card(身長など)と同じ文字サイズ・
// 太さで揃えたいため、選択フォームの長い説明文とは別に短縮版を用意する(2026-08-16)。
export const ACTIVITY_LEVEL_SHORT_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'デスクワーク中心',
  light: '軽い運動習慣',
  moderate: '中程度の運動',
  active: '激しい運動習慣',
};

// design.md §3「プロフィールタブ」対応。詳細画面「アカウント設定」の中身。プロフィール編集
// (US-14)+テーマ切替・アカウント削除(US-16、2026-08-16にアカウント画面から統合。
// ログアウトはヘッダーに移動。プロフィールタブと同名で紛らわしいため「アカウント設定」に改称)。
export function renderProfileEdit(container: HTMLElement, onAccountDeleted: () => void): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getMe()
    .then((profile) => draw(profile))
    .catch((err) => {
      container.innerHTML = `<p class="error">プロフィールの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(profile: Profile): void {
    container.innerHTML = `
      <form id="profile-form">
        <div class="field-row">
          <label class="field">表示名 <input type="text" id="profile-name" value="${escapeHtml(profile.display_name)}" required /></label>
          <label class="field">生年月日 <input type="date" id="profile-birth-date" value="${escapeHtml(profile.birth_date ?? '')}" /></label>
        </div>
        <div class="field-row">
          <label class="field">性別
            <select id="profile-gender">
              ${(Object.keys(GENDER_LABELS) as Gender[])
                .map(
                  (g) => `<option value="${g}" ${g === profile.gender ? 'selected' : ''}>${escapeHtml(GENDER_LABELS[g])}</option>`
                )
                .join('')}
            </select>
          </label>
          <label class="field">身長(cm)
            <input type="number" id="profile-height" min="1" value="${profile.height_cm ?? ''}" />
          </label>
        </div>
        <div class="field-row">
          <label class="field">活動レベル
            <select id="profile-activity-level">
              <option value="">未設定</option>
              ${(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[])
                .map(
                  (a) =>
                    `<option value="${a}" ${a === profile.activity_level ? 'selected' : ''}>${escapeHtml(ACTIVITY_LEVEL_LABELS[a])}</option>`
                )
                .join('')}
            </select>
          </label>
        </div>
        <button type="submit">保存</button>
        <p id="profile-status"></p>
      </form>

      <h3>テーマ</h3>
      <div id="theme-toggle-wrap"></div>

      <h3>アカウントの削除</h3>
      <button type="button" id="delete-account-btn" class="danger">アカウントを削除する</button>
    `;

    const formEl = container.querySelector<HTMLFormElement>('#profile-form')!;
    const statusEl = container.querySelector<HTMLParagraphElement>('#profile-status')!;
    formEl.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const displayName = container.querySelector<HTMLInputElement>('#profile-name')!.value;
      const birthDate = container.querySelector<HTMLInputElement>('#profile-birth-date')!.value;
      const gender = container.querySelector<HTMLSelectElement>('#profile-gender')!.value as Gender;
      const heightCm = container.querySelector<HTMLInputElement>('#profile-height')!.value;
      const activityLevel = container.querySelector<HTMLSelectElement>('#profile-activity-level')!.value as ActivityLevel | '';
      statusEl.textContent = '保存中...';
      try {
        await updateMe(displayName, birthDate, gender, heightCm, activityLevel);
        profile.display_name = displayName;
        statusEl.textContent = '保存しました';
      } catch (err) {
        statusEl.textContent = `保存に失敗しました: ${errorMessage(err)}`;
      }
    });

    renderThemeToggle(container.querySelector<HTMLElement>('#theme-toggle-wrap')!);

    container.querySelector('#delete-account-btn')!.addEventListener('click', async () => {
      if (!confirm('本当にアカウントを削除しますか?この操作は取り消せず、全てのデータが即座に失われます。')) return;
      try {
        await deleteAccount();
        onAccountDeleted();
      } catch (err) {
        alert(`削除に失敗しました: ${errorMessage(err)}`);
      }
    });
  }
}
