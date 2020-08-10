import { findDiffStart, findDiffEnd } from "./diff";
import { Schema } from "./schema";
import { Node as ProsemirrorNode, TextNode } from "./node";

// ::- A fragment represents a node's collection of child nodes.
//
// Like nodes, fragments are persistent data structures, and you
// should not mutate them or their content. Rather, you create new
// instances whenever needed. The API tries to make this easy.
export class Fragment<S extends Schema = any> {
  size: number;
  content: ProsemirrorNode<S>[];

  constructor(content: ProsemirrorNode<S>[], size?: number) {
    this.content = content;
    // :: number
    // The size of the fragment, which is the total of the size of its
    // content nodes.
    this.size = size || 0;
    if (size == null) for (let i = 0; i < content.length; i++) this.size += content[i].nodeSize;
  }

  // :: (number, number, (node: Node, start: number, parent: Node, index: number) → ?bool, ?number)
  // Invoke a callback for all descendant nodes between the given two
  // positions (relative to start of this fragment). Doesn't descend
  // into a node when the callback returns `false`.
  nodesBetween(
    from: number,
    to: number,
    f: (
      node: ProsemirrorNode<S>,
      pos: number,
      parent: ProsemirrorNode<S>,
      index: number
    ) => boolean | null | undefined | void,
    nodeStart: number = 0,
    parent?: ProsemirrorNode<S>
  ) {
    for (let i = 0, pos = 0; pos < to; i++) {
      let child = this.content[i],
        end = pos + child.nodeSize;
      if (end > from && f(child, nodeStart + pos, parent, i) !== false && child.content.size) {
        let start = pos + 1;
        child.nodesBetween(Math.max(0, from - start), Math.min(child.content.size, to - start), f, nodeStart + start);
      }
      pos = end;
    }
  }

  // :: ((node: Node, pos: number, parent: Node) → ?bool)
  // Call the given callback for every descendant node. The callback
  // may return `false` to prevent traversal of a given node's children.
  descendants(
    f: (node: ProsemirrorNode<S>, pos: number, parent: ProsemirrorNode<S>) => boolean | null | undefined | void
  ) {
    this.nodesBetween(0, this.size, f);
  }

  // : (number, number, ?string, ?string) → string
  textBetween(from: number, to: number, blockSeparator?: string, leafText?: string) {
    let text = "",
      separated = true;
    this.nodesBetween(
      from,
      to,
      (node: TextNode<S>, pos: number) => {
        if (node.isText) {
          text += node.text.slice(Math.max(from, pos) - pos, to - pos);
          separated = !blockSeparator;
        } else if (node.isLeaf && leafText) {
          text += leafText;
          separated = !blockSeparator;
        } else if (!separated && node.isBlock) {
          text += blockSeparator;
          separated = true;
        }
      },
      0
    );
    return text;
  }

  // :: (Fragment) → Fragment
  // Create a new fragment containing the combined content of this
  // fragment and the other.
  append(other: Fragment<S>): Fragment<S> {
    if (!other.size) return this;
    if (!this.size) return other;
    let last = this.lastChild,
      first = other.firstChild,
      content = this.content.slice(),
      i = 0;
    // XXX 由于没有 withText 方法，添加了 last instanceof TextNode  条件
    if (last.isText && last instanceof TextNode && last instanceof TextNode && last.sameMarkup(first)) {
      content[content.length - 1] = last.withText(last.text + first.text);
      i = 1;
    }
    for (; i < other.content.length; i++) content.push(other.content[i]);
    return new Fragment(content, this.size + other.size);
  }

  // :: (number, ?number) → Fragment
  // Cut out the sub-fragment between the two given positions.
  cut(from: number, to?: number): Fragment<S> {
    if (to == null) to = this.size;
    if (from == 0 && to == this.size) return this;
    let result = [],
      size = 0;
    if (to > from)
      for (let i = 0, pos = 0; pos < to; i++) {
        let child = this.content[i],
          end = pos + child.nodeSize;
        if (end > from) {
          if (pos < from || end > to) {
            if (child.isText) child = child.cut(Math.max(0, from - pos), Math.min(child.text.length, to - pos));
            else child = child.cut(Math.max(0, from - pos - 1), Math.min(child.content.size, to - pos - 1));
          }
          result.push(child);
          size += child.nodeSize;
        }
        pos = end;
      }
    return new Fragment(result, size);
  }

  cutByIndex(from: number, to: number) {
    if (from == to) return Fragment.empty;
    if (from == 0 && to == this.content.length) return this;
    return new Fragment(this.content.slice(from, to));
  }

  // :: (number, Node) → Fragment
  // Create a new fragment in which the node at the given index is
  // replaced by the given node.
  replaceChild(index: number, node: ProsemirrorNode<S>): Fragment<S> {
    let current = this.content[index];
    if (current == node) return this;
    let copy = this.content.slice();
    let size = this.size + node.nodeSize - current.nodeSize;
    copy[index] = node;
    return new Fragment(copy, size);
  }

  // : (Node) → Fragment
  // Create a new fragment by prepending the given node to this
  // fragment.
  addToStart(node: ProsemirrorNode<S>): Fragment<S> {
    return new Fragment([node].concat(this.content), this.size + node.nodeSize);
  }

  // : (Node) → Fragment
  // Create a new fragment by appending the given node to this
  // fragment.
  addToEnd(node: ProsemirrorNode<S>): Fragment<S> {
    return new Fragment(this.content.concat(node), this.size + node.nodeSize);
  }

  // :: (Fragment) → bool
  // Compare this fragment to another one.
  eq(other: Fragment<S>): boolean {
    if (this.content.length != other.content.length) return false;
    for (let i = 0; i < this.content.length; i++) if (!this.content[i].eq(other.content[i])) return false;
    return true;
  }

  // :: ?Node
  // The first child of the fragment, or `null` if it is empty.
  get firstChild(): ProsemirrorNode<S> | null {
    return this.content.length ? this.content[0] : null;
  }

  // :: ?Node
  // The last child of the fragment, or `null` if it is empty.
  get lastChild(): ProsemirrorNode<S> | null {
    return this.content.length ? this.content[this.content.length - 1] : null;
  }

  // :: number
  // The number of child nodes in this fragment.
  get childCount(): number {
    return this.content.length;
  }

  // :: (number) → Node
  // Get the child node at the given index. Raise an error when the
  // index is out of range.
  child(index: number): ProsemirrorNode<S> {
    let found = this.content[index];
    if (!found) throw new RangeError("Index " + index + " out of range for " + this);
    return found;
  }

  // :: (number) → ?Node
  // Get the child node at the given index, if it exists.
  maybeChild(index: number): ProsemirrorNode<S> | undefined {
    return this.content[index];
  }

  // :: ((node: Node, offset: number, index: number))
  // Call `f` for every child node, passing the node, its offset
  // into this parent node, and its index.
  forEach(f: (node: ProsemirrorNode<S>, offset: number, index: number) => void): void {
    for (let i = 0, p = 0; i < this.content.length; i++) {
      let child = this.content[i];
      f(child, p, i);
      p += child.nodeSize;
    }
  }

  // :: (Fragment) → ?number
  // Find the first position at which this fragment and another
  // fragment differ, or `null` if they are the same.
  findDiffStart(other: Fragment<S>, pos: number = 0): number | undefined {
    return findDiffStart(this, other, pos);
  }

  // :: (Fragment) → ?{a: number, b: number}
  // Find the first position, searching from the end, at which this
  // fragment and the given fragment differ, or `null` if they are the
  // same. Since this position will not be the same in both nodes, an
  // object with two separate positions is returned.
  findDiffEnd(other: Fragment<S>, pos = this.size, otherPos = other.size) {
    return findDiffEnd(this, other, pos, otherPos);
  }

  // : (number, ?number) → {index: number, offset: number}
  // Find the index and inner offset corresponding to a given relative
  // position in this fragment. The result object will be reused
  // (overwritten) the next time the function is called. (Not public.)
  findIndex(pos: number, round: number = -1): { index: number; offset: number } {
    if (pos == 0) return retIndex(0, pos);
    if (pos == this.size) return retIndex(this.content.length, pos);
    if (pos > this.size || pos < 0) throw new RangeError(`Position ${pos} outside of fragment (${this})`);
    for (let i = 0, curPos = 0; ; i++) {
      let cur = this.child(i),
        end = curPos + cur.nodeSize;
      if (end >= pos) {
        if (end == pos || round > 0) return retIndex(i + 1, end);
        return retIndex(i, curPos);
      }
      curPos = end;
    }
  }

  // :: () → string
  // Return a debugging string that describes this fragment.
  toString(): string {
    return "<" + this.toStringInner() + ">";
  }

  toStringInner(): string {
    return this.content.join(", ");
  }

  // :: () → ?Object
  // Create a JSON-serializeable representation of this fragment.
  toJSON() {
    return this.content.length ? this.content.map((n) => n.toJSON()) : null;
  }

  // :: (Schema, ?Object) → Fragment
  // Deserialize a fragment from its JSON representation.
  static fromJSON(schema: Schema, value?: Object): Fragment {
    if (!value) return Fragment.empty;
    if (!Array.isArray(value)) throw new RangeError("Invalid input for Fragment.fromJSON");
    return new Fragment(value.map(schema.nodeFromJSON));
  }

  // :: ([Node]) → Fragment
  // Build a fragment from an array of nodes. Ensures that adjacent
  // text nodes with the same marks are joined together.
  static fromArray<S extends Schema = any>(array: ProsemirrorNode<S>[]) {
    if (!array.length) return Fragment.empty;
    let joined: ProsemirrorNode<S>[],
      size = 0;
    for (let i = 0; i < array.length; i++) {
      let node = array[i];
      size += node.nodeSize;
      if (i && node.isText && node instanceof TextNode && array[i - 1].sameMarkup(node)) {
        if (!joined) joined = array.slice(0, i);
        joined[joined.length - 1] = node.withText(joined[joined.length - 1].text + node.text);
      } else if (joined) {
        joined.push(node);
      }
    }
    return new Fragment(joined || array, size);
  }

  // :: (?union<Fragment, Node, [Node]>) → Fragment
  // Create a fragment from something that can be interpreted as a set
  // of nodes. For `null`, it returns the empty fragment. For a
  // fragment, the fragment itself. For a node or array of nodes, a
  // fragment containing those nodes.
  static from<S extends Schema = any>(nodes: Fragment<S> | ProsemirrorNode<S> | Array<ProsemirrorNode<S>>) {
    if (!nodes) return Fragment.empty;
    if (nodes instanceof Fragment) return nodes;
    if (Array.isArray(nodes)) return this.fromArray(nodes);
    if (nodes.attrs) return new Fragment([nodes], nodes.nodeSize);
    throw new RangeError(
      "Can not convert " +
        nodes +
        " to a Fragment" +
        (nodes.nodesBetween ? " (looks like multiple versions of prosemirror-model were loaded)" : "")
    );
  }
}

const found = { index: 0, offset: 0 };
function retIndex(index: number, offset: number) {
  found.index = index;
  found.offset = offset;
  return found;
}

// :: Fragment
// An empty fragment. Intended to be reused whenever a node doesn't
// contain anything (rather than allocating a new empty fragment for
// each leaf node).
export namespace Fragment {
  export const empty = new Fragment([], 0);
}
