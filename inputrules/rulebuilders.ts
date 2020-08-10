import { InputRule } from "./inputrules";
import { findWrapping, canJoin } from "../transform";
import { NodeType, Node as ProsemirrorNode, Schema } from "../model";

// :: (RegExp, NodeType, ?union<Object, ([string]) → ?Object>, ?([string], Node) → bool) → InputRule
// Build an input rule for automatically wrapping a textblock when a
// given string is typed. The `regexp` argument is
// directly passed through to the `InputRule` constructor. You'll
// probably want the regexp to start with `^`, so that the pattern can
// only occur at the start of a textblock.
//
// `nodeType` is the type of node to wrap in. If it needs attributes,
// you can either pass them directly, or pass a function that will
// compute them from the regular expression match.
//
// By default, if there's a node with the same type above the newly
// wrapped node, the rule will try to [join](#transform.Transform.join) those
// two nodes. You can pass a join predicate, which takes a regular
// expression match and the node before the wrapped node, and can
// return a boolean to indicate whether a join should happen.
export function wrappingInputRule<S extends Schema = any>(
  regexp: RegExp,
  nodeType: NodeType,
  getAttrs?: { [key: string]: any } | ((p: string[]) => { [key: string]: any } | null | undefined),
  joinPredicate?: (p1: string[], p2: ProsemirrorNode<S>) => boolean
) {
  return new InputRule(regexp, (state, match, start, end) => {
    let attrs = getAttrs instanceof Function ? getAttrs(match as any) : getAttrs;
    let tr = state.tr.delete(start, end);
    let $start = tr.doc.resolve(start),
      range = $start.blockRange(),
      wrapping = range && findWrapping(range, nodeType, attrs);
    if (!wrapping) return null;
    tr.wrap(range, wrapping);
    let before = tr.doc.resolve(start - 1).nodeBefore;
    if (
      before &&
      before.type == nodeType &&
      canJoin(tr.doc, start - 1) &&
      (!joinPredicate || joinPredicate(match as any, before))
    )
      tr.join(start - 1);
    return tr;
  });
}

// :: (RegExp, NodeType, ?union<Object, ([string]) → ?Object>) → InputRule
// Build an input rule that changes the type of a textblock when the
// matched text is typed into it. You'll usually want to start your
// regexp with `^` to that it is only matched at the start of a
// textblock. The optional `getAttrs` parameter can be used to compute
// the new node's attributes, and works the same as in the
// `wrappingInputRule` function.
export function textblockTypeInputRule<S extends Schema = any>(
  regexp: RegExp,
  nodeType: NodeType<S>,
  getAttrs?: { [key: string]: any } | ((p: string[]) => { [key: string]: any } | null | undefined)
) {
  return new InputRule(regexp, (state, match, start, end) => {
    let $start = state.doc.resolve(start);
    let attrs = getAttrs instanceof Function ? getAttrs(match as any) : getAttrs;
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) return null;
    return state.tr.delete(start, end).setBlockType(start, start, nodeType, attrs);
  });
}
