const GOOD_LEAF_SIZE = 200;

// :: class<T> A rope sequence is a persistent sequence data structure
// that supports appending, prepending, and slicing without doing a
// full copy. It is represented as a mostly-balanced tree.
export class RopeSequence<T = any> {
  length: number;
  static empty: Leaf<unknown>;

  // length:: number
  // The length of the rope.

  // :: (union<[T], RopeSequence<T>>) → RopeSequence<T>
  // Append an array or other rope to this one, returning a new rope.
  append(other: T[] | RopeSequence<T>) {
    if (!other.length) return this;
    other = RopeSequence.from(other);

    return (
      (!this.length && other) ||
      (other.length < GOOD_LEAF_SIZE && this.leafAppend(other)) ||
      (this.length < GOOD_LEAF_SIZE && (other as any).leafPrepend(this)) ||
      this.appendInner(other)
    );
  }

  // :: (union<[T], RopeSequence<T>>) → RopeSequence<T>
  // Prepend an array or other rope to this one, returning a new rope.
  prepend(other: T[] | RopeSequence<T>) {
    if (!other.length) return this;
    return RopeSequence.from(other).append(this);
  }

  appendInner(other: T[] | RopeSequence<T>) {
    return new Append(this, other);
  }
  // XXX 继承类中实现
  leafAppend(other: T[] | RopeSequence<T>) {}
  // XXX 继承类中实现
  leafPrepend(other: T[] | RopeSequence<T>) {}

  // :: (?number, ?number) → RopeSequence<T>
  // Create a rope repesenting a sub-sequence of this rope.
  slice(from = 0, to = this.length) {
    if (from >= to) return RopeSequence.empty;
    return this.sliceInner(Math.max(0, from), Math.min(this.length, to));
  }
  // XXX 继承类中实现
  sliceInner(from = 0, to = this.length) {}

  // :: (number) → T
  // Retrieve the element at the given position from this rope.
  get(i: number) {
    if (i < 0 || i >= this.length) return undefined;
    return this.getInner(i);
  }
  // XXX 继承类中实现
  getInner(i: number) {}

  // :: ((element: T, index: number) → ?bool, ?number, ?number)
  // Call the given function for each element between the given
  // indices. This tends to be more efficient than looping over the
  // indices and calling `get`, because it doesn't have to descend the
  // tree for every element.
  forEach(f: (element: T, index: number) => boolean | undefined | number, from: number = 0, to: number = this.length) {
    if (from <= to) this.forEachInner(f, from, to, 0);
    else this.forEachInvertedInner(f, from, to, 0);
  }

  // XXX 继承类中实现
  forEachInner(
    f: (element: T, index: number) => boolean | undefined | number,
    from: number,
    to: number,
    start: number
  ) {}

  // XXX 继承类中实现
  forEachInvertedInner(
    f: (element: T, index: number) => boolean | undefined | number,
    from: number,
    to: number,
    start: number
  ) {}

  // :: ((element: T, index: number) → U, ?number, ?number) → [U]
  // Map the given functions over the elements of the rope, producing
  // a flat array.
  map(f: (element: T, index: number) => boolean | undefined | number, from = 0, to = this.length) {
    let result: any[] = [];
    this.forEach((elt, i) => result.push(f(elt, i)), from, to);
    return result;
  }

  // :: (?union<[T], RopeSequence<T>>) → RopeSequence<T>
  // Create a rope representing the given array, or return the rope
  // itself if a rope was given.
  static from<T>(values: RopeSequence<T> | T[]) {
    if (values instanceof RopeSequence) return values;
    return values && values.length ? new Leaf(values) : RopeSequence.empty;
  }

  // flatten:: () → [T]
  // Return the content of this rope as an array.

  flatten() {}
}

class Leaf<T> extends RopeSequence<T> {
  values: any[];

  constructor(values: any[]) {
    super();
    this.values = values;
  }

  flatten() {
    return this.values;
  }

  sliceInner(from: number, to: number) {
    if (from == 0 && to == this.length) return this;
    return new Leaf(this.values.slice(from, to));
  }

  getInner(i: number) {
    return this.values[i];
  }

  forEachInner(f: (value: any, index: number) => boolean, from: number, to: number, start: number) {
    for (let i = from; i < to; i++) if (f(this.values[i], start + i) === false) return false;
  }

  forEachInvertedInner(f: (value: any, index: number) => boolean, from: number, to: number, start: number) {
    for (let i = from - 1; i >= to; i--) if (f(this.values[i], start + i) === false) return false;
  }

  leafAppend(other: T[] | Leaf<T>) {
    if (this.length + other.length <= GOOD_LEAF_SIZE) return new Leaf(this.values.concat((other as any).flatten()));
  }

  leafPrepend(other: T[] | Leaf<T>) {
    if (this.length + other.length <= GOOD_LEAF_SIZE) return new Leaf((other as any).flatten().concat(this.values));
  }

  get length() {
    return this.values.length;
  }

  get depth() {
    return 0;
  }
}

// :: RopeSequence
// The empty rope sequence.
RopeSequence.empty = new Leaf([]);

class Append extends RopeSequence {
  left: any;
  right: any;
  length: number;
  depth: number;

  constructor(left: any, right: any) {
    super();
    this.left = left;
    this.right = right;
    this.length = left.length + right.length;
    this.depth = Math.max(left.depth, right.depth) + 1;
  }

  flatten() {
    return this.left.flatten().concat(this.right.flatten());
  }

  getInner(i: number) {
    return i < this.left.length ? this.left.get(i) : this.right.get(i - this.left.length);
  }

  forEachInner(f: any, from: number, to: number, start: number) {
    let leftLen = this.left.length;
    if (from < leftLen && this.left.forEachInner(f, from, Math.min(to, leftLen), start) === false) return false;
    if (
      to > leftLen &&
      this.right.forEachInner(f, Math.max(from - leftLen, 0), Math.min(this.length, to) - leftLen, start + leftLen) ===
        false
    )
      return false;
  }

  forEachInvertedInner(f: any, from: number, to: number, start: number) {
    let leftLen = this.left.length;
    if (
      from > leftLen &&
      this.right.forEachInvertedInner(f, from - leftLen, Math.max(to, leftLen) - leftLen, start + leftLen) === false
    )
      return false;
    if (to < leftLen && this.left.forEachInvertedInner(f, Math.min(from, leftLen), to, start) === false) return false;
  }

  sliceInner(from: number, to: number) {
    if (from == 0 && to == this.length) return this;
    let leftLen = this.left.length;
    if (to <= leftLen) return this.left.slice(from, to);
    if (from >= leftLen) return this.right.slice(from - leftLen, to - leftLen);
    return this.left.slice(from, leftLen).append(this.right.slice(0, to - leftLen));
  }

  leafAppend(other: any) {
    let inner = this.right.leafAppend(other);
    if (inner) return new Append(this.left, inner);
  }

  leafPrepend(other: any) {
    let inner = this.left.leafPrepend(other);
    if (inner) return new Append(inner, this.right);
  }

  appendInner(other: any) {
    if (this.left.depth >= Math.max(this.right.depth, other.depth) + 1)
      return new Append(this.left, new Append(this.right, other));
    return new Append(this, other);
  }
}
