// 文部科学省「日本食品標準成分表(八訂)増補2023年」第2章(データ)Excelから、
// foods テーブル用の INSERT SQL(sql/foods_seed.sql)を生成する。
//
// 実行方法(xlsx パッケージは既知の未修正脆弱性があるため、恒久的な依存には加えていない):
//   npm install xlsx --no-save
//   node sql/import/generate_foods_sql.js
//   npm uninstall xlsx
//
// 入力: sql/import/ 配下に配置した「第2章(データ)」xlsx(ファイル名は下記 INPUT_FILE を実際のファイル名に合わせる)
// 出力: sql/foods_seed.sql

import XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';

const INPUT_FILE = '20260327-mxt_kagsei-mext-000029402_02.xlsx';
const inputPath = path.join(process.cwd(), 'sql', 'import', INPUT_FILE);
const outputPath = path.join(process.cwd(), 'sql', 'foods_seed.sql');

const FOOD_GROUP_NAMES = {
  '01': '穀類',
  '02': 'いも及びでん粉類',
  '03': '砂糖及び甘味類',
  '04': '豆類',
  '05': '種実類',
  '06': '野菜類',
  '07': '果実類',
  '08': 'きのこ類',
  '09': '藻類',
  10: '魚介類',
  11: '肉類',
  12: '卵類',
  13: '乳類',
  14: '油脂類',
  15: '菓子類',
  16: 'し好飲料類',
  17: '調味料及び香辛料類',
  18: '調理済み流通食品類',
};

// COL_*: 表全体シートの列インデックス(0始まり)。行11(成分識別子)の値をもとに確認済み。
const COL_GROUP = 0; // 食品群
const COL_NUMBER = 1; // 食品番号
const COL_NAME = 3; // 食品名
const COL_KCAL = 6; // ENERC_KCAL
const COL_PROTEIN = 9; // PROT-
const COL_FAT = 12; // FAT-
const COL_CARB = 20; // CHOCDF-

function parseNutrientValue(raw) {
  const s = String(raw).trim();
  if (s === 'Tr' || s === '(Tr)') return 0; // 微量
  if (s === '-' || s === '(-)' || s === '') return null; // 未測定
  const stripped = s.replace(/^\(|\)$/g, ''); // 「(11.3)」= 他成分からの計算値。カッコを外して数値として扱う
  const n = parseFloat(stripped);
  if (Number.isNaN(n)) {
    throw new Error(`想定外の値です: ${JSON.stringify(raw)}`);
  }
  return n;
}

function escapeSqlString(s) {
  return s.replace(/'/g, "''");
}

function sqlValue(n, decimals) {
  return n === null ? 'NULL' : n.toFixed(decimals);
}

const wb = XLSX.readFile(inputPath, { cellStyles: false });
const ws = wb.Sheets['表全体'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
const dataRows = rows.filter((r) => /^\d{5}$/.test(String(r[COL_NUMBER]).trim()));

const values = dataRows.map((r) => {
  const groupCode = String(r[COL_GROUP]).trim().padStart(2, '0');
  const groupName = FOOD_GROUP_NAMES[groupCode];
  if (!groupName) {
    throw new Error(`未知の食品群コードです: ${groupCode}`);
  }
  const foodNumber = String(r[COL_NUMBER]).trim();
  const name = escapeSqlString(String(r[COL_NAME]).trim());
  const kcal = sqlValue(parseNutrientValue(r[COL_KCAL]), 1);
  const protein = sqlValue(parseNutrientValue(r[COL_PROTEIN]), 2);
  const fat = sqlValue(parseNutrientValue(r[COL_FAT]), 2);
  const carb = sqlValue(parseNutrientValue(r[COL_CARB]), 2);
  return `('${foodNumber}', '${groupCode}', '${groupName}', '${name}', ${kcal}, ${protein}, ${fat}, ${carb})`;
});

const CHUNK_SIZE = 250;
const statements = [];
for (let i = 0; i < values.length; i += CHUNK_SIZE) {
  const chunk = values.slice(i, i + CHUNK_SIZE);
  statements.push(
    `INSERT INTO foods (food_number, food_group_code, food_group_name, name, kcal_per_100g, protein_g_per_100g, fat_g_per_100g, carb_g_per_100g) VALUES\n${chunk.join(',\n')};`
  );
}

const header = `-- 自動生成ファイル(sql/import/generate_foods_sql.js)。手動編集しない。
-- 出典: 文部科学省「日本食品標準成分表(八訂)増補2023年」から引用
-- 生成元: ${INPUT_FILE}
-- 生成日時: ${new Date().toISOString()}
-- 件数: ${dataRows.length}件

-- foodsはmeal_items/recipe_itemsから外部キー参照されているため、その制約がある限り
-- (データの有無に関わらず)TRUNCATEはFKエラーになる。一時的にチェックを無効化する。
SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE foods;
SET FOREIGN_KEY_CHECKS = 1;

`;

fs.writeFileSync(outputPath, header + statements.join('\n\n') + '\n', 'utf8');
console.log(`書き出し完了: ${outputPath} (${dataRows.length}件, ${statements.length}バッチ)`);
