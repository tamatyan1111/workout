import { Chart, registerables } from 'chart.js';

// Chart.jsは既定でHelvetica/Arial系フォントを使うため、指定しないとグラフの文字だけ
// 他画面(style.cssの--font-ui)と食い違って見える。3タブのグラフ全てで一度だけ設定する。
Chart.register(...registerables);
Chart.defaults.font.family =
  "'SystemJP', -apple-system, BlinkMacSystemFont, 'Hiragino Sans', 'Noto Sans JP', 'Segoe UI', Roboto, sans-serif";

export { Chart };
