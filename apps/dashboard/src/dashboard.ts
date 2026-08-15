import { getBoard, getCycles, getLogs } from './api';
import { renderAccount } from './account';
import { renderBoard } from './board';
import { renderBoardEdit } from './boardEdit';
import { renderBodyWeight } from './bodyWeight';
import { renderCycleManagement } from './cycleManagement';
import { renderDataExport } from './dataExport';
import { renderGraph } from './graph';
import { renderNutrition } from './nutrition';
import { renderProfileEdit } from './profileEdit';
import { renderRecentLogs } from './recentLogs';
import { renderRecordForm } from './recordForm';
import { escapeHtml } from 'shared';

// design.md §3「ログイン後(通常時)」対応。3タブ(運動・食事・プロフィール)のシェル。
// 運動タブは記録入力・直近の記録・管理表・グラフ・管理表の編集・サイクル管理をまとめて持つ
// (§3.1〜3.2)。プロフィールタブはプロフィール編集・体重記録・データのエクスポート・
// アカウントをまとめて持つ(2026-08-15、旧・体重タブ+設定タブを再編)。
export function renderDashboard(container: HTMLElement, displayName: string, onLoggedOut: () => void): void {
  container.innerHTML = `
    <header class="site-header">
      <h1>からだ手帳</h1>
      <p class="welcome">ようこそ、${escapeHtml(displayName)}さん</p>
      <nav class="tabs">
        <button type="button" class="tab-button active" data-tab="exercise">運動</button>
        <button type="button" class="tab-button" data-tab="nutrition">食事</button>
        <button type="button" class="tab-button" data-tab="profile">プロフィール</button>
      </nav>
    </header>
    <main>
      <section id="tab-exercise" class="tab-panel">
        <h2>記録を入力</h2>
        <div id="record-form"><p>読み込み中...</p></div>
        <h2>直近の記録</h2>
        <div id="recent-logs"></div>
        <h2>管理表</h2>
        <div id="board-view"><p>読み込み中...</p></div>
        <h2>グラフ</h2>
        <div id="graph-view"><p>読み込み中...</p></div>
        <h2>管理表の編集</h2>
        <div id="board-edit"><p>読み込み中...</p></div>
        <h2>サイクル管理</h2>
        <div id="cycle-management"><p>読み込み中...</p></div>
      </section>
      <section id="tab-nutrition" class="tab-panel" hidden></section>
      <section id="tab-profile" class="tab-panel" hidden>
        <h2>プロフィール</h2>
        <div id="profile-edit"><p>読み込み中...</p></div>
        <h2>体重記録</h2>
        <div id="body-weight"><p>読み込み中...</p></div>
        <h2>データのエクスポート</h2>
        <div id="data-export"><p>読み込み中...</p></div>
        <h2>アカウント</h2>
        <div id="account"><p>読み込み中...</p></div>
      </section>
    </main>
    <footer class="app-footer">
      <a href="/terms.html" target="_blank" rel="noopener">利用規約</a> ・
      <a href="/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>
    </footer>
  `;

  const tabButtons = container.querySelectorAll<HTMLButtonElement>('.tab-button');
  const panels: Record<string, HTMLElement> = {
    exercise: container.querySelector<HTMLElement>('#tab-exercise')!,
    nutrition: container.querySelector<HTMLElement>('#tab-nutrition')!,
    profile: container.querySelector<HTMLElement>('#tab-profile')!,
  };
  const nutritionEl = panels.nutrition;

  const profileEditEl = container.querySelector<HTMLElement>('#profile-edit')!;
  const bodyWeightEl = container.querySelector<HTMLElement>('#body-weight')!;
  const dataExportEl = container.querySelector<HTMLElement>('#data-export')!;
  const accountEl = container.querySelector<HTMLElement>('#account')!;

  let nutritionRendered = false;
  let profileRendered = false;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab!;
      Object.entries(panels).forEach(([key, el]) => {
        el.hidden = key !== tab;
      });
      // 食事・プロフィールタブは自前でデータ取得するが、初回だけ描画すれば以降はタブ内で完結する
      if (tab === 'nutrition' && !nutritionRendered) {
        renderNutrition(nutritionEl);
        nutritionRendered = true;
      }
      if (tab === 'profile' && !profileRendered) {
        renderProfileEdit(profileEditEl);
        renderBodyWeight(bodyWeightEl);
        renderDataExport(dataExportEl);
        renderAccount(accountEl, onLoggedOut);
        profileRendered = true;
      }
    });
  });

  const recordFormEl = container.querySelector<HTMLElement>('#record-form')!;
  const recentLogsEl = container.querySelector<HTMLElement>('#recent-logs')!;
  const boardViewEl = container.querySelector<HTMLElement>('#board-view')!;
  const graphEl = container.querySelector<HTMLElement>('#graph-view')!;
  const boardEditEl = container.querySelector<HTMLElement>('#board-edit')!;
  const cycleManagementEl = container.querySelector<HTMLElement>('#cycle-management')!;

  async function loadExercisePanel(): Promise<void> {
    try {
      const [exercises, cycles, logs] = await Promise.all([getBoard(), getCycles(), getLogs()]);
      renderBoard(boardViewEl, exercises);
      renderRecordForm(recordFormEl, exercises, () => {
        void renderRecentLogs(recentLogsEl);
        void loadGraph();
      });
      renderBoardEdit(boardEditEl, exercises, cycles, () => void loadExercisePanel());
      renderGraph(graphEl, exercises, logs);
      renderCycleManagement(cycleManagementEl, cycles, () => void loadExercisePanel());
    } catch (err) {
      const message = `<p class="error">運動タブの取得に失敗しました: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
      boardViewEl.innerHTML = message;
      recordFormEl.innerHTML = message;
      boardEditEl.innerHTML = message;
      graphEl.innerHTML = message;
      cycleManagementEl.innerHTML = message;
    }
  }

  // 記録の追加はグラフにも反映したいが、管理表全体の再読み込み(記録フォームのリセットを伴う)は
  // 避けたいため、グラフだけを軽く取り直す専用の関数を分ける
  async function loadGraph(): Promise<void> {
    try {
      const [exercises, logs] = await Promise.all([getBoard(), getLogs()]);
      renderGraph(graphEl, exercises, logs);
    } catch (err) {
      graphEl.innerHTML = `<p class="error">グラフの取得に失敗しました: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  }

  void loadExercisePanel();
  void renderRecentLogs(recentLogsEl);
}
