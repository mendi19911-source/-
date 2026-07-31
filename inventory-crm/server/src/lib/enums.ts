export const SOURCE_STORES = ["qarnette", "tiktak", "other"] as const;
export type SourceStore = (typeof SOURCE_STORES)[number];

export const PRODUCT_STATUSES = ["active", "archived"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const MOVEMENT_TYPES = ["in", "out", "adjustment"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const PRICE_FIELDS = ["cost_price", "retail_price"] as const;
export type PriceField = (typeof PRICE_FIELDS)[number];

export const LOW_MARGIN_THRESHOLD_PERCENT = 20;

export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
