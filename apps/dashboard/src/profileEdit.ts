import { getMe, updateMe } from './api';
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

// design.md §3「プロフィールタブ」対応。プロフィール編集(US-14)。
export function renderProfileEdit(container: HTMLElement): void {
  container.innerHTML = '<p>読み込み中...</p>';

  void getMe()
    .then((profile) => draw(profile))
    .catch((err) => {
      container.innerHTML = `<p class="error">プロフィールの取得に失敗しました: ${escapeHtml(errorMessage(err))}</p>`;
    });

  function draw(profile: Profile): void {
    container.innerHTML = `
      <form id="profile-form">
        <label>表示名 <input type="text" id="profile-name" value="${escapeHtml(profile.display_name)}" required /></label>
        <label>生年月日 <input type="date" id="profile-birth-date" value="${escapeHtml(profile.birth_date ?? '')}" /></label>
        <label>性別
          <select id="profile-gender">
            ${(Object.keys(GENDER_LABELS) as Gender[])
              .map(
                (g) => `<option value="${g}" ${g === profile.gender ? 'selected' : ''}>${escapeHtml(GENDER_LABELS[g])}</option>`
              )
              .join('')}
          </select>
        </label>
        <label>身長(cm)<span class="field-note">BMI・食事機能の目標カロリー計算に使用</span>
          <input type="number" id="profile-height" min="1" value="${profile.height_cm ?? ''}" />
        </label>
        <label>活動レベル<span class="field-note">TDEE(維持カロリー)計算に使用</span>
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
        <button type="submit">保存</button>
        <p id="profile-status"></p>
      </form>
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
  }
}
