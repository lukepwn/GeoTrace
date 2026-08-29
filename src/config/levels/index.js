import { LEVEL_ONE } from "./levelone";
import { LEVEL_TWO } from "./leveltwo";

export const LEVELS = [LEVEL_ONE, LEVEL_TWO];

export const DEFAULT_LEVEL_ID = "levelone";

export function getLevelById(id) {
  return LEVELS.find((lvl) => lvl.id === id) ?? LEVEL_ONE;
}

export { LEVEL_ONE, LEVEL_TWO };
