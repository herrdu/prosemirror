import { Schema, Node as ProsemirrorNode } from "../model";
import { Mapping } from "../transform";
import { Selection } from "./selection";

/**
 * A lightweight, document-independent representation of a selection.
 * You can define a custom bookmark type for a custom selection class
 * to make the history handle it well.
 */
export interface SelectionBookmark<S extends Schema = any> {
  /**
   * Map the bookmark through a set of changes.
   */
  map(mapping: Mapping): SelectionBookmark<S>;
  /**
   * Resolve the bookmark to a real selection again. This may need to
   * do some error checking and may fall back to a default (usually
   * [`TextSelection.between`](#state.TextSelection^between)) if
   * mapping made the bookmark invalid.
   */
  resolve(doc: ProsemirrorNode<S>): Selection<S>;
}
