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
}

export interface SetInput {
  weight: string;
  reps: string;
}

// design.md §7・§2.11〜2.17「食事記録機能」対応

export type PfcMode = 'standard' | 'bulk' | 'cut' | 'custom';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

// design.md §2.11「nutrition_goals テーブル」に対応
export interface NutritionGoal {
  id: number;
  start_weight: number;
  target_weight: number;
  target_date: string;
  pfc_mode: PfcMode;
  custom_protein_g: number | null;
  custom_fat_g: number | null;
  custom_carb_g: number | null;
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
}

// design.md §2.16・2.17「BMI・TDEE・目標カロリー・PFC・進捗マイルストーン」get_nutrition_summaryのレスポンス
export interface NutritionSummary {
  height_cm: number | null;
  activity_level: string | null;
  current_weight: number | null;
  bmi: number | null;
  bmi_category: string | null;
  bmr: number | null;
  tdee: number | null;
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
  source: 'master' | 'custom';
  id: number;
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
  food_name: string;
  kcal_per_100g: number;
  protein_g_per_100g: number;
  fat_g_per_100g: number;
  carb_g_per_100g: number;
  quantity_g: number;
  recipe_batch_id: string | null;
  recipe_name: string | null;
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
