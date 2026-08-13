import './style.css';
import { getBoard } from './api';
import { renderRecordForm } from './recordForm';
import { renderRecentLogs } from './recentLogs';
import { renderBoardEdit } from './boardEdit';

const app = document.querySelector<HTMLDivElement>('#app')!;

app.innerHTML = `
  <header class="site-header">
    <h1>たまちゃんの筋トレ管理(入力)</h1>
  </header>
  <main>
    <section>
      <h2>記録を入力</h2>
      <div id="record-form"><p>読み込み中...</p></div>
    </section>
    <section>
      <h2>直近の記録</h2>
      <div id="recent-logs"></div>
    </section>
    <section>
      <h2>管理表の編集</h2>
      <div id="board-edit"><p>読み込み中...</p></div>
    </section>
  </main>
`;

const recentLogsEl = app.querySelector<HTMLElement>('#recent-logs')!;
const recordFormEl = app.querySelector<HTMLElement>('#record-form')!;
const boardEditEl = app.querySelector<HTMLElement>('#board-edit')!;

// 種目一覧はページ内で1回だけ取得し、記録フォーム・管理表編集の両方で使い回す
async function loadAll(): Promise<void> {
  try {
    const exercises = await getBoard();
    renderRecordForm(recordFormEl, exercises, () => renderRecentLogs(recentLogsEl));
    renderBoardEdit(boardEditEl, exercises, loadAll);
  } catch (err) {
    const message = `<p class="error">管理表の取得に失敗しました: ${String(err)}</p>`;
    recordFormEl.innerHTML = message;
    boardEditEl.innerHTML = message;
  }
}

loadAll();
renderRecentLogs(recentLogsEl);
