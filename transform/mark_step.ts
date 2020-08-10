import { Fragment, Slice, Node as ProsemirrorNode, Schema, Mark } from "../model";
import { Step, StepResult } from "./step";
import { Mapping } from "./map";

function mapFragment(
  fragment: Fragment,
  f: (child: ProsemirrorNode, parent: ProsemirrorNode, i: number) => ProsemirrorNode,
  parent?: ProsemirrorNode
) {
  let mapped = [];
  for (let i = 0; i < fragment.childCount; i++) {
    let child = fragment.child(i);
    if (child.content.size) child = child.copy(mapFragment(child.content, f, child));
    if (child.isInline) child = f(child, parent, i);
    mapped.push(child);
  }
  return Fragment.fromArray(mapped);
}

// ::- Add a mark to all inline content between two positions.
export class AddMarkStep<S extends Schema = any> extends Step<S> {
  from: number;
  to: number;
  mark: Mark;

  // :: (number, number, Mark)
  constructor(from: number, to: number, mark: Mark) {
    super();
    this.from = from;
    this.to = to;
    this.mark = mark;
  }

  apply(doc: ProsemirrorNode) {
    let oldSlice = doc.slice(this.from, this.to),
      $from = doc.resolve(this.from);
    let parent = $from.node($from.sharedDepth(this.to));
    let slice = new Slice(
      mapFragment(
        oldSlice.content,
        (node, parent) => {
          if (!parent.type.allowsMarkType(this.mark.type)) return node;
          return node.mark(this.mark.addToSet(node.marks));
        },
        parent
      ),
      oldSlice.openStart,
      oldSlice.openEnd
    );
    return StepResult.fromReplace(doc, this.from, this.to, slice);
  }

  invert() {
    return new RemoveMarkStep(this.from, this.to, this.mark);
  }

  map(mapping: Mapping) {
    let from = mapping.mapResult(this.from, 1),
      to = mapping.mapResult(this.to, -1);
    if ((from.deleted && to.deleted) || from.pos >= to.pos) return null;
    return new AddMarkStep(from.pos, to.pos, this.mark);
  }

  merge(other: AddMarkStep) {
    if (other instanceof AddMarkStep && other.mark.eq(this.mark) && this.from <= other.to && this.to >= other.from)
      return new AddMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
  }

  toJSON() {
    return { stepType: "addMark", mark: this.mark.toJSON(), from: this.from, to: this.to };
  }

  static fromJSON(schema: Schema, json: any) {
    if (typeof json.from != "number" || typeof json.to != "number")
      throw new RangeError("Invalid input for AddMarkStep.fromJSON");
    return new AddMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
  }
}

Step.jsonID("addMark", AddMarkStep);

// ::- Remove a mark from all inline content between two positions.
export class RemoveMarkStep extends Step {
  from: number;
  to: number;
  mark: Mark;

  // :: (number, number, Mark)
  constructor(from: number, to: number, mark: Mark) {
    super();
    this.from = from;
    this.to = to;
    this.mark = mark;
  }

  apply(doc: ProsemirrorNode) {
    let oldSlice = doc.slice(this.from, this.to);
    let slice = new Slice(
      mapFragment(oldSlice.content, (node) => {
        return node.mark(this.mark.removeFromSet(node.marks));
      }),
      oldSlice.openStart,
      oldSlice.openEnd
    );
    return StepResult.fromReplace(doc, this.from, this.to, slice);
  }

  invert() {
    return new AddMarkStep(this.from, this.to, this.mark);
  }

  map(mapping: Mapping) {
    let from = mapping.mapResult(this.from, 1),
      to = mapping.mapResult(this.to, -1);
    if ((from.deleted && to.deleted) || from.pos >= to.pos) return null;
    return new RemoveMarkStep(from.pos, to.pos, this.mark);
  }

  merge(other: RemoveMarkStep) {
    if (other instanceof RemoveMarkStep && other.mark.eq(this.mark) && this.from <= other.to && this.to >= other.from)
      return new RemoveMarkStep(Math.min(this.from, other.from), Math.max(this.to, other.to), this.mark);
  }

  toJSON() {
    return { stepType: "removeMark", mark: this.mark.toJSON(), from: this.from, to: this.to };
  }

  static fromJSON(schema: Schema, json: any) {
    if (typeof json.from != "number" || typeof json.to != "number")
      throw new RangeError("Invalid input for RemoveMarkStep.fromJSON");
    return new RemoveMarkStep(json.from, json.to, schema.markFromJSON(json.mark));
  }
}

Step.jsonID("removeMark", RemoveMarkStep);
