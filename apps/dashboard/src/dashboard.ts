import { getBoard, getCycles, getLogs, logout } from './api';
import { renderBoard } from './board';
import { renderBoardEdit } from './boardEdit';
import { renderBodyWeight } from './bodyWeight';
import { renderBodyWeightGraph } from './bodyWeightGraph';
import { renderCycleManagement } from './cycleManagement';
import { renderDataExport } from './dataExport';
import { renderGoalSettings } from './goalSettings';
import { renderGraph } from './graph';
import { renderHome } from './home';
import { renderNutrition } from './nutrition';
import { renderProfileEdit } from './profileEdit';
import { renderProfileSummary } from './profileSummary';
import { renderRecentBodyWeights } from './recentBodyWeights';
import { renderRecentLogs } from './recentLogs';
import { renderRecordForm } from './recordForm';
import { initScreenNav } from './screenNav';
import { escapeHtml } from 'shared';

// design.md §3「ログイン後(通常時)」対応。ロゴタップで開くホーム+3タブ(運動・食事・
// プロフィール)のシェル。運動・食事・プロフィールの各タブはランディング(サマリー+
// 日常的な入力+直近の履歴)+詳細画面(グラフ確認・管理・設定系)の構成
// (§3.1〜3.2、UI再設計フェーズ2でランディング/詳細分割、2026-08-16に運動タブと同じ
// 構成へ統一)。プロフィールタブの詳細画面はプロフィール(テーマ・アカウント削除を含む)・
// 目標・エクスポート(2026-08-16、アカウント画面を廃止しプロフィールへ統合。
// ログアウトは常にヘッダーに表示)。ホーム画面はUI再設計フェーズ2で追加(2026-08-15)。
export function renderDashboard(container: HTMLElement, displayName: string, onLoggedOut: () => void): void {
  container.innerHTML = `
    <header class="site-header">
      <div class="header-inner">
        <button type="button" class="logo" id="logo-home">からだ手帳</button>
        <div class="header-right">
          <button type="button" class="welcome" id="welcome-profile-link">ようこそ、${escapeHtml(displayName)}さん</button>
          <button type="button" class="header-logout-btn" id="header-logout-btn">ログアウト</button>
        </div>
      </div>
    </header>
    <nav class="tabs tabs-standalone">
      <button type="button" class="tab-button" data-tab="exercise">運動</button>
      <button type="button" class="tab-button" data-tab="nutrition">食事</button>
      <button type="button" class="tab-button" data-tab="profile">プロフィール</button>
    </nav>
    <main>
      <section id="tab-home" class="tab-panel"></section>
      <section id="tab-exercise" class="tab-panel" hidden>
        <div data-screen="landing" class="stack">
          <div class="card">
            <h2>サマリー</h2>
            <div id="board-view"><p>読み込み中...</p></div>
          </div>
          <div class="card">
            <h2>運動を記録</h2>
            <div id="record-form"><p>読み込み中...</p></div>
          </div>
          <div class="card">
            <h2>直近の履歴</h2>
            <div id="recent-logs"></div>
          </div>
          <div class="link-list">
            <button type="button" class="link-card" data-goto="graph">
              <span>
                <span class="link-title">グラフ確認</span>
                <span class="link-desc">重量・回数・総作業量の推移</span>
              </span>
              <span class="chev">→</span>
            </button>
            <button type="button" class="link-card" data-goto="cycles">
              <span>
                <span class="link-title">サイクル管理</span>
                <span class="link-desc">分割(Push/Pull/Legsなど)の追加・変更</span>
              </span>
              <span class="chev">→</span>
            </button>
            <button type="button" class="link-card" data-goto="board">
              <span>
                <span class="link-title">種目管理</span>
                <span class="link-desc">目標値の変更・種目の追加や廃止</span>
              </span>
              <span class="chev">→</span>
            </button>
          </div>
        </div>
        <div data-screen="board" hidden>
          <button type="button" class="link-button" data-goto="landing">← 運動に戻る</button>
          <div class="card">
            <h2>種目管理</h2>
            <div id="board-edit"><p>読み込み中...</p></div>
          </div>
        </div>
        <div data-screen="graph" hidden>
          <button type="button" class="link-button" data-goto="landing">← 運動に戻る</button>
          <div class="card">
            <h2>グラフ確認</h2>
            <div id="graph-view"><p>読み込み中...</p></div>
          </div>
        </div>
        <div data-screen="cycles" hidden>
          <button type="button" class="link-button" data-goto="landing">← 運動に戻る</button>
          <div class="card">
            <h2>サイクル管理</h2>
            <div id="cycle-management"><p>読み込み中...</p></div>
          </div>
        </div>
      </section>
      <section id="tab-nutrition" class="tab-panel" hidden></section>
      <section id="tab-profile" class="tab-panel" hidden>
        <div data-screen="landing" class="stack">
          <div class="card">
            <h2>サマリー</h2>
            <div id="profile-summary"><p>読み込み中...</p></div>
          </div>
          <div class="card">
            <h2>体重を記録する</h2>
            <div id="body-weight"><p>読み込み中...</p></div>
          </div>
          <div class="card">
            <h2>直近の履歴</h2>
            <div id="recent-body-weights"></div>
          </div>
          <div class="link-list">
            <button type="button" class="link-card" data-goto="graph">
              <span>
                <span class="link-title">グラフ確認</span>
                <span class="link-desc">体重の推移</span>
              </span>
              <span class="chev">→</span>
            </button>
            <button type="button" class="link-card" data-goto="edit">
              <span>
                <span class="link-title">アカウント設定</span>
                <span class="link-desc">表示名・生年月日・性別・身長・活動レベル・テーマ・アカウント削除</span>
              </span>
              <span class="chev">→</span>
            </button>
            <button type="button" class="link-card" data-goto="goals">
              <span>
                <span class="link-title">目標</span>
                <span class="link-desc">目標体重・達成期日・PFC配分方式</span>
              </span>
              <span class="chev">→</span>
            </button>
            <button type="button" class="link-card" data-goto="export">
              <span>
                <span class="link-title">エクスポート</span>
                <span class="link-desc">記録・体重データをCSVでダウンロード</span>
              </span>
              <span class="chev">→</span>
            </button>
          </div>
        </div>
        <div data-screen="graph" hidden>
          <button type="button" class="link-button" data-goto="landing">← プロフィールに戻る</button>
          <div class="card">
            <h2>グラフ確認</h2>
            <div id="body-weight-graph"><p>読み込み中...</p></div>
          </div>
        </div>
        <div data-screen="edit" hidden>
          <button type="button" class="link-button" data-goto="landing">← プロフィールに戻る</button>
          <div class="card">
            <h2>アカウント設定</h2>
            <div id="profile-edit"><p>読み込み中...</p></div>
          </div>
        </div>
        <div data-screen="goals" hidden>
          <button type="button" class="link-button" data-goto="landing">← プロフィールに戻る</button>
          <div class="card">
            <h2>目標</h2>
            <div id="goal-settings"><p>読み込み中...</p></div>
          </div>
        </div>
        <div data-screen="export" hidden>
          <button type="button" class="link-button" data-goto="landing">← プロフィールに戻る</button>
          <div class="card">
            <h2>エクスポート</h2>
            <div id="data-export"><p>読み込み中...</p></div>
          </div>
        </div>
      </section>
    </main>
    <footer class="app-footer">
      <a href="/terms.html" target="_blank" rel="noopener">利用規約</a> ・
      <a href="/privacy.html" target="_blank" rel="noopener">プライバシーポリシー</a>
    </footer>
  `;

  const tabButtons = container.querySelectorAll<HTMLButtonElement>('.tab-button');
  const panels: Record<string, HTMLElement> = {
    home: container.querySelector<HTMLElement>('#tab-home')!,
    exercise: container.querySelector<HTMLElement>('#tab-exercise')!,
    nutrition: container.querySelector<HTMLElement>('#tab-nutrition')!,
    profile: container.querySelector<HTMLElement>('#tab-profile')!,
  };
  const nutritionEl = panels.nutrition;

  initScreenNav(panels.exercise, 'landing');
  initScreenNav(panels.profile, 'landing');

  const profileSummaryEl = container.querySelector<HTMLElement>('#profile-summary')!;
  const profileEditEl = container.querySelector<HTMLElement>('#profile-edit')!;
  const goalSettingsEl = container.querySelector<HTMLElement>('#goal-settings')!;
  const bodyWeightEl = container.querySelector<HTMLElement>('#body-weight')!;
  const recentBodyWeightsEl = container.querySelector<HTMLElement>('#recent-body-weights')!;
  const bodyWeightGraphEl = container.querySelector<HTMLElement>('#body-weight-graph')!;
  const dataExportEl = container.querySelector<HTMLElement>('#data-export')!;

  let exerciseRendered = false;
  let nutritionRendered = false;
  let profileRendered = false;

  // ロゴタップ(→ホーム)・タブ切替の両方から呼ばれる、画面表示の中心関数
  function showPanel(key: string): void {
    tabButtons.forEach((b) => b.classList.toggle('active', b.dataset.tab === key));
    Object.entries(panels).forEach(([panelKey, el]) => {
      el.hidden = panelKey !== key;
    });
  }

  // ホーム・タブどちらから来ても、各タブの初回描画(データ取得)は1回だけ行う
  function activateTab(tab: string): void {
    showPanel(tab);
    if (tab === 'exercise' && !exerciseRendered) {
      exerciseRendered = true;
      void loadExercisePanel();
      void renderRecentLogs(recentLogsEl);
    }
    if (tab === 'nutrition' && !nutritionRendered) {
      nutritionRendered = true;
      renderNutrition(nutritionEl);
    }
    if (tab === 'profile' && !profileRendered) {
      profileRendered = true;
      renderProfileSummary(profileSummaryEl);
      renderProfileEdit(profileEditEl, onLoggedOut);
      renderGoalSettings(goalSettingsEl);
      renderBodyWeight(bodyWeightEl, onBodyWeightSaved);
      void renderRecentBodyWeights(recentBodyWeightsEl);
      renderBodyWeightGraph(bodyWeightGraphEl);
      renderDataExport(dataExportEl);
    }
  }

  function onBodyWeightSaved(): void {
    void renderRecentBodyWeights(recentBodyWeightsEl);
    renderBodyWeightGraph(bodyWeightGraphEl);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab!));
  });
  container.querySelector('#logo-home')!.addEventListener('click', () => showPanel('home'));
  container.querySelector('#welcome-profile-link')!.addEventListener('click', () => activateTab('profile'));
  container.querySelector('#header-logout-btn')!.addEventListener('click', async () => {
    await logout();
    window.location.reload();
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

  renderHome(panels.home, (tab) => activateTab(tab));
  showPanel('home');
}
