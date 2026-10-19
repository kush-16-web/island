/**
 * PetMovement: Manages anchor points, screen bounds,
 * island collision avoidance, and natural wander paths.
 */
import { DIRECTIONS } from './PetTypes';

export class PetMovement {
  constructor({ stageWidth = 720, padding = 16 } = {}) {
    this.stageWidth = stageWidth;
    this.padding = padding;
  }

  /**
   * Calculates safe wander bounds that will NEVER accidentally collide
   * or overlap with the Dynamic Island.
   * @param {number} islandWidth - current width of the Island pill (e.g. 136 to 468)
   * @param {string} side - 'right' | 'left'
   * @param {number} petWidth - visual width of the pet (typically 80)
   */
  getSafeZone(islandWidth, side = 'right', petWidth = 80) {
    const halfIsland = islandWidth / 2;
    const halfStage = this.stageWidth / 2;
    const safetyGap = 16; // guaranteed clearance from island border

    if (side === 'left') {
      const minX = -halfStage + this.padding;
      const maxX = -halfIsland - safetyGap - petWidth;
      return { minX: Math.min(minX, maxX), maxX };
    }

    // Default: Right side companion zone
    const minX = halfIsland + safetyGap;
    const maxX = halfStage - this.padding - petWidth;
    return { minX, maxX: Math.max(minX, maxX) };
  }

  /**
   * Generates a new walk target within the safe zone
   */
  pickWalkTarget(currentX, islandWidth, side = 'right', petWidth = 80) {
    const { minX, maxX } = this.getSafeZone(islandWidth, side, petWidth);
    if (maxX <= minX) return { targetX: minX, direction: DIRECTIONS.RIGHT };

    // Pick a new spot with at least 30px distance from current position
    let targetX = minX + Math.random() * (maxX - minX);
    if (Math.abs(targetX - currentX) < 25) {
      targetX = targetX > (minX + maxX) / 2 ? minX + 5 : maxX - 5;
    }

    const direction = targetX >= currentX ? DIRECTIONS.RIGHT : DIRECTIONS.LEFT;
    return { targetX, direction };
  }

  /**
   * Clamps current X position if island expanded (e.g. opened Hub)
   */
  clampToSafe(currentX, islandWidth, side = 'right', petWidth = 80) {
    const { minX, maxX } = this.getSafeZone(islandWidth, side, petWidth);
    if (currentX < minX) return minX;
    if (currentX > maxX) return maxX;
    return currentX;
  }
}
