export type { SetGroup, Exercise, Cycle, Profile, Gender, ApiResponse } from 'shared';

// design.md §2.10「get_recent_logs」のレスポンス形式に対応
export interface RecentLog {
  id: number;
  exercise_id: number;
  exercise_name: string;
  cycle_id: number | null;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}

// design.md §2.5「logs テーブル」に対応(グラフ用)
export interface LogRow {
  id: number;
  exercise_id: number;
  logged_date: string;
  set_number: number;
  weight: number | null;
  reps: number;
}

// design.md §2.6「body_weight_logs テーブル」に対応
export interface BodyWeightLog {
  id: number;
  logged_date: string;
  weight: number;
  body_fat_percentage: number | null;
}

export interface SetInput {
  weight: string;
  reps: string;
}

// design.md §7・§2.11〜2.17「食事記録機能」対応

export type PfcMode = 'standard' | 'bulk' | 'cut' | 'custom' | 'custom_ratio';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// design.md §2.11「nutrition_goals テーブル」に対応。保存済みの生の値(GoalSummaryのような
// 計算済みの結果ではない)を返す、目標編集フォームの初期値復元用(goalSettings.ts参照)
export interface NutritionGoal {
  id: number;
  start_weight: number;
  target_weight: number;
  target_body_fat_percentage: number | null;
  target_date: string;
  pfc_mode: PfcMode;
  custom_protein_g: number | null;
  custom_fat_g: number | null;
  custom_carb_g: number | null;
  custom_protein_percent: number | null;
  custom_fat_percent: number | null;
  custom_carb_percent: number | null;
}

export interface Pfc {
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  warning: string | null;
}

export interface GoalSummary {
  target_weight: number;
  target_date: string;
  pfc_mode: PfcMode;
  days_remaining: number;
  overdue: boolean;
  target_calories: number | null;
  pfc: Pfc | null;
  progress_percent: number | null;
  newly_reached_milestone: number | null;
  target_bmi: number | null;
  target_bmi_category: string | null;
  target_body_fat_percentage: number | null;
}

// design.md §2.16・2.17「BMI・TDEE・目標カロリー・PFC・進捗マイルストーン」get_nutrition_summaryのレスポンス
export interface NutritionSummary {
  height_cm: number | null;
  activity_level: string | null;
  current_weight: number | null;
  current_body_fat_percentage: number | null;
  bmi: number | null;
  bmi_category: string | null;
  bmr: number | null;
  tdee: number | null;
  today_kcal: number;
  today_protein_g: number;
  today_fat_g: number;
  today_carb_g: number;
  goal: GoalSummary | null;
}

// design.md §2.12「foods」・§2.13「custom_foods」を横断するsearch_foods.phpのレスポンス1件
export interface FoodSearchResult {
  source: 'master' | 'custom';
  id: number;
  food_group_code: string | null;
  food_group_name: string | null;
  name: string;
  kcal_per_100g: number;
  protein_g_per_100g: number | null;
  fat_g_per_100g: number | null;
  carb_g_per_100g: number | null;
}

// design.md §2.13「custom_foods テーブル」に対応
export interface CustomFood {
  id: number;
  name: string;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  fat_g_per_100g: number;
  carb_g_per_100g: number;
}

// 食材の指定は、food_group_code等を持たないよう source を明示した形でAPIに送る
export interface FoodRef {
  source: 'master' | 'custom' | 'eating_out';
  id: number;
}

// design.md §2.20「eating_out_meals テーブル」に対応。材料は分からないが名前と総量の
// 栄養値だけ分かる食事(外食・コンビニ惣菜等)。custom_foodsと違い「100gあたり」ではなく
// 「1食分の実値」をそのまま持つ
export interface EatingOutMeal {
  id: number;
  name: string;
  shop_name: string | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
}

// 食事を記録する画面の「よく使う内容」(2026-08-21、design.md未記載、UI再設計フェーズ2)。
// 「食品+量」の組み合わせをワンタップでカートに追加するための保存済みショートカット。
// スナップショットではなく、食品の最新の名前・栄養値を都度参照する(meal_favoritesのJOIN参照)。
export interface MealFavorite {
  id: number;
  source: 'master' | 'custom';
  food_id: number;
  name: string;
  quantity_g: number;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  fat_g_per_100g: number;
  carb_g_per_100g: number;
}

export interface RecipeItem {
  master_food_id: number | null;
  custom_food_id: number | null;
  food_name: string;
  quantity_g: number;
}

// design.md §2.14「recipes/recipe_items テーブル」に対応
export interface Recipe {
  id: number;
  name: string;
  is_shared: boolean;
  items: RecipeItem[];
}

// design.md §2.19「レシピの共有リンク機能」対応。get_shared_recipe.phpのレスポンス
// (未ログインの閲覧者向けなので、食事ログのFoodRef方式とは別に栄養値そのものを持つ)
export interface SharedRecipeItem {
  quantity_g: number;
  food: {
    name: string;
    kcal_per_100g: number;
    protein_g_per_100g: number;
    fat_g_per_100g: number;
    carb_g_per_100g: number;
  };
}

export interface SharedRecipe {
  name: string;
  items: SharedRecipeItem[];
}

export interface MealItem {
  id: number;
  master_food_id: number | null;
  custom_food_id: number | null;
  eating_out_meal_id: number | null;
  food_name: string;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  fat_g_per_100g: number;
  carb_g_per_100g: number;
  quantity_g: number;
  recipe_batch_id: string | null;
  recipe_name: string | null;
  eating_out_shop_name: string | null;
}

// design.md §2.15「meals/meal_items テーブル」に対応
export interface Meal {
  id: number;
  logged_date: string;
  meal_type: MealType;
  photo_path: string | null;
  items: MealItem[];
}

// 食事カート(add_meal.php・add_meal_item.phpへ送る1品分の内容)
export interface CartItem {
  ref: FoodRef;
  name: string;
  quantityG: number;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbPer100g: number;
}
