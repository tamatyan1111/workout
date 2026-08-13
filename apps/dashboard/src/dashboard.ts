import { getBoard, getCycles, getLogs } from './api';
import { renderBoard } from './board';
import { renderBoardEdit } from './boardEdit';
import { renderBodyWeight } from './bodyWeight';
import { renderGraph } from './graph';
import { renderRecentLogs } from './recentLogs';
import { renderRecordForm } from './recordForm';
import { renderSettings } from './settings';
import { escapeHtml } from 'shared';

// design.md §3「ログイン後(通常時)」対応。4タブ(管理表・グラフ・体重・設定)のシェル。
// 管理表タブは記録入力・直近の記録・管理表の表示・管理表の編集(§3.1〜3.2)をまとめて持つ。
export function renderDashboard(container: HTMLElement, displayName: string, onLoggedOut: () => void): void {
  container.innerHTML = `
    <header class="site-header">
      <h1>たまちゃんの筋トレ管理</h1>
      <p class="welcome">ようこそ、${escapeHtml(displayName)}さん</p>
      <nav class="tabs">
        <button type="button" class="tab-button active" data-tab="board">管理表</button>
        <button type="button" class="tab-button" data-tab="graph">グラフ</button>
        <button type="button" class="tab-button" data-tab="body-weight">体重</button>
        <button type="button" class="tab-button" data-tab="settings">設定</button>
      </nav>
    </header>
    <main>
      <section id="tab-board" class="tab-panel">
        <h2>記録を入力</h2>
        <div id="record-form"><p>読み込み中...</p></div>
        <h2>直近の記録</h2>
        <div id="recent-logs"></div>
        <h2>管理表</h2>
        <div id="board-view"><p>読み込み中...</p></div>
        <h2>管理表の編集</h2>
        <div id="board-edit"><p>読み込み中...</p></div>
      </section>
      <section id="tab-graph" class="tab-panel" hidden><p>読み込み中...</p></section>
      <section id="tab-body-weight" class="tab-panel" hidden></section>
      <section id="tab-settings" class="tab-panel" hidden></section>
    </main>
  `;

  const tabButtons = container.querySelectorAll<HTMLButtonElement>('.tab-button');
  const panels: Record<string, HTMLElement> = {
    board: container.querySelector<HTMLElement>('#tab-board')!,
    graph: container.querySelector<HTMLElement>('#tab-graph')!,
    'body-weight': container.querySelector<HTMLElement>('#tab-body-weight')!,
    settings: container.querySelector<HTMLElement>('#tab-settings')!,
  };
  const graphEl = panels.graph;
  const bodyWeightEl = panels['body-weight'];
  const settingsEl = panels.settings;

  let bodyWeightRendered = false;
  let settingsRendered = false;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab!;
      Object.entries(panels).forEach(([key, el]) => {
        el.hidden = key !== tab;
      });
      // 記録の追加・修正・削除は管理表タブで行われるため、グラフタブは開くたびに最新データを取り直す
      if (tab === 'graph') void loadGraph();
      // 体重・設定タブは自前でデータ取得するが、初回だけ描画すれば以降はタブ内で完結する
      if (tab === 'body-weight' && !bodyWeightRendered) {
        renderBodyWeight(bodyWeightEl);
        bodyWeightRendered = true;
      }
      if (tab === 'settings' && !settingsRendered) {
        renderSettings(settingsEl, onLoggedOut);
        settingsRendered = true;
      }
    });
  });

  const recordFormEl = container.querySelector<HTMLElement>('#record-form')!;
  const recentLogsEl = container.querySelector<HTMLElement>('#recent-logs')!;
  const boardViewEl = container.querySelector<HTMLElement>('#board-view')!;
  const boardEditEl = container.querySelector<HTMLElement>('#board-edit')!;

  async function loadBoardTab(): Promise<void> {
    try {
      const [exercises, cycles] = await Promise.all([getBoard(), getCycles()]);
      renderBoard(boardViewEl, exercises);
      renderRecordForm(recordFormEl, exercises, () => {
        void renderRecentLogs(recentLogsEl);
      });
      renderBoardEdit(boardEditEl, exercises, cycles, () => void loadBoardTab());
    } catch (err) {
      const message = `<p class="error">管理表の取得に失敗しました: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
      boardViewEl.innerHTML = message;
      recordFormEl.innerHTML = message;
      boardEditEl.innerHTML = message;
    }
  }

  async function loadGraph(): Promise<void> {
    try {
      const [exercises, logs] = await Promise.all([getBoard(), getLogs()]);
      renderGraph(graphEl, exercises, logs);
    } catch (err) {
      graphEl.innerHTML = `<p class="error">グラフの取得に失敗しました: ${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
    }
  }

  void loadBoardTab();
  void renderRecentLogs(recentLogsEl);
}
