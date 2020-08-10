import { MapResult } from "./map";
import { ResolvedPos } from "../model";

/**
 * There are several things that positions can be mapped through.
 * Such objects conform to this interface.
 */
export interface Mappable {
  /**
   * Map a position through this object. When given, `assoc` (should
   * be -1 or 1, defaults to 1) determines with which side the
   * position is associated, which determines in which direction to
   * move when a chunk of content is inserted at the mapped position.
   */
  map(pos: number, assoc?: number): number;
  /**
   * Map a position, and return an object containing additional
   * information about the mapping. The result's `deleted` field tells
   * you whether the position was deleted (completely enclosed in a
   * replaced range) during the mapping. When content on only one side
   * is deleted, the position itself is only considered deleted when
   * `assoc` points in the direction of the deleted content.
   */
  mapResult(pos: number, assoc?: number): MapResult;
}
