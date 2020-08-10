// DOMOutputSpec:: interface
// A description of a DOM structure. Can be either a string, which is
// interpreted as a text node, a DOM node, which is interpreted as
// itself, or an array.
//
// An array describes a DOM element. The first value in the array
// should be a string—the name of the DOM element. If the second
// element is plain object, it is interpreted as a set of attributes
// for the element. Any elements after that (including the 2nd if it's
// not an attribute object) are interpreted as children of the DOM
// elements, and must either be valid `DOMOutputSpec` values, or the
// number zero.
//
// The number zero (pronounced “hole”) is used to indicate the place
// where a node's child nodes should be inserted. If it occurs in an
// output spec, it should be the only child element in its parent
// node.

import { Schema } from "./schema";
import { Node as ProsemirrorNode, TextNode } from "./node";
import { DOMOutputSpec, DOMOutputSpecArray } from "./types";
import { Mark } from "./mark";
import { Fragment } from "./fragment";

// ::- A DOM serializer knows how to convert ProseMirror nodes and
// marks of various types to DOM nodes.
export class DOMSerializer<S extends Schema = any> {
  /**
   * The node serialization functions.
   */
  nodes: { [name: string]: (node: ProsemirrorNode<S>) => DOMOutputSpec };
  /**
   * The mark serialization functions.
   */
  marks: { [name: string]: (mark: Mark<S>, inline: boolean) => DOMOutputSpec };

  // :: (Object<(node: Node) → DOMOutputSpec>, Object<?(mark: Mark, inline: bool) → DOMOutputSpec>)
  // Create a serializer. `nodes` should map node names to functions
  // that take a node and return a description of the corresponding
  // DOM. `marks` does the same for mark names, but also gets an
  // argument that tells it whether the mark's content is block or
  // inline content (for typical use, it'll always be inline). A mark
  // serializer may be `null` to indicate that marks of that type
  // should not be serialized.
  constructor(
    nodes: { [name: string]: (node: ProsemirrorNode<S>) => DOMOutputSpec },
    marks: { [name: string]: (mark: Mark<S>, inline: boolean) => DOMOutputSpec }
  ) {
    // :: Object<(node: Node) → DOMOutputSpec>
    // The node serialization functions.
    this.nodes = nodes || {};
    // :: Object<?(mark: Mark, inline: bool) → DOMOutputSpec>
    // The mark serialization functions.
    this.marks = marks || {};
  }

  // :: (Fragment, ?Object) → dom.DocumentFragment
  // Serialize the content of this fragment to a DOM fragment. When
  // not in the browser, the `document` option, containing a DOM
  // document, should be passed so that the serializer can create
  // nodes.
  serializeFragment(fragment: Fragment, options?: { [key: string]: any }, target?: DocumentFragment) {
    if (!target) target = doc(options).createDocumentFragment();

    let top = target,
      active = null;
    fragment.forEach((node) => {
      if (active || node.marks.length) {
        if (!active) active = [];
        let keep = 0,
          rendered = 0;
        while (keep < active.length && rendered < node.marks.length) {
          let next = node.marks[rendered];
          if (!this.marks[next.type.name]) {
            rendered++;
            continue;
          }
          if (!next.eq(active[keep]) || next.type.spec.spanning === false) break;
          keep += 2;
          rendered++;
        }
        while (keep < active.length) {
          top = active.pop();
          active.pop();
        }
        while (rendered < node.marks.length) {
          let add = node.marks[rendered++];
          let markDOM = this.serializeMark(add, node.isInline, options);
          if (markDOM) {
            active.push(add, top);
            top.appendChild(markDOM.dom);
            top = markDOM.contentDOM || markDOM.dom;
          }
        }
      }
      top.appendChild(this.serializeNode(node, options));
    });

    return target;
  }

  // :: (Node, ?Object) → dom.Node
  // Serialize this node to a DOM node. This can be useful when you
  // need to serialize a part of a document, as opposed to the whole
  // document. To serialize a whole document, use
  // [`serializeFragment`](#model.DOMSerializer.serializeFragment) on
  // its [content](#model.Node.content).
  serializeNode(node: ProsemirrorNode, options: { [key: string]: any } = {}) {
    let { dom, contentDOM } = DOMSerializer.renderSpec(doc(options), this.nodes[node.type.name](node));
    if (contentDOM) {
      if (node.isLeaf) throw new RangeError("Content hole not allowed in a leaf node spec");
      if (options.onContent) options.onContent(node, contentDOM, options);
      else this.serializeFragment(node.content, options, contentDOM);
    }
    return dom;
  }

  serializeNodeAndMarks(node: ProsemirrorNode, options: { [key: string]: any } = {}) {
    let dom = this.serializeNode(node, options);
    for (let i = node.marks.length - 1; i >= 0; i--) {
      let wrap = this.serializeMark(node.marks[i], node.isInline, options);
      if (wrap) {
        (wrap.contentDOM || wrap.dom).appendChild(dom);
        dom = wrap.dom;
      }
    }
    return dom;
  }

  serializeMark(mark: Mark, inline: boolean, options = {}) {
    let toDOM = this.marks[mark.type.name];
    return toDOM && DOMSerializer.renderSpec(doc(options), toDOM(mark, inline));
  }

  // :: (dom.Document, DOMOutputSpec) → {dom: dom.Node, contentDOM: ?dom.Node}
  // Render an [output spec](#model.DOMOutputSpec) to a DOM node. If
  // the spec has a hole (zero) in it, `contentDOM` will point at the
  // node with the hole.
  static renderSpec(doc: HTMLDocument, structure: DOMOutputSpec) {
    if (typeof structure == "string") return { dom: doc.createTextNode(structure) };
    if ((structure as Node).nodeType != null) return { dom: structure };
    let dom = doc.createElement(structure[0]),
      contentDOM = null;
    let attrs = structure[1],
      start = 1;
    if (attrs && typeof attrs == "object" && attrs.nodeType == null && !Array.isArray(attrs)) {
      start = 2;
      for (let name in attrs) {
        if (attrs[name] != null) dom.setAttribute(name, attrs[name]);
      }
    }
    for (let i = start; i < (structure as any).length; i++) {
      let child = structure[i];
      if (child === 0) {
        if (i < (structure as any).length - 1 || i > start)
          throw new RangeError("Content hole must be the only child of its parent node");
        return { dom, contentDOM: dom };
      } else {
        let { dom: inner, contentDOM: innerContent } = DOMSerializer.renderSpec(doc, child);
        dom.appendChild(inner);
        if (innerContent) {
          if (contentDOM) throw new RangeError("Multiple content holes");
          contentDOM = innerContent;
        }
      }
    }
    return { dom, contentDOM };
  }

  // :: (Schema) → DOMSerializer
  // Build a serializer using the [`toDOM`](#model.NodeSpec.toDOM)
  // properties in a schema's node and mark specs.
  static fromSchema(schema: Schema) {
    return (
      schema.cached.domSerializer ||
      (schema.cached.domSerializer = new DOMSerializer(this.nodesFromSchema(schema), this.marksFromSchema(schema)))
    );
  }

  // : (Schema) → Object<(node: Node) → DOMOutputSpec>
  // Gather the serializers in a schema's node specs into an object.
  // This can be useful as a base to build a custom serializer from.
  static nodesFromSchema(schema: Schema) {
    let result = gatherToDOM(schema.nodes);
    // TODO 确定这里的类型
    if (!result.text) result.text = (node: any) => node.text;
    return result;
  }

  // : (Schema) → Object<(mark: Mark) → DOMOutputSpec>
  // Gather the serializers in a schema's mark specs into an object.
  static marksFromSchema(schema: Schema) {
    return gatherToDOM(schema.marks);
  }
}

function gatherToDOM(obj: Schema["nodes"] | Schema["marks"]) {
  let result: { [key: string]: any } = {};
  for (let name in obj) {
    let toDOM = obj[name].spec.toDOM;
    if (toDOM) result[name] = toDOM;
  }
  return result;
}

function doc(options: { [key: string]: any }) {
  // declare global: window
  return options.document || window.document;
}
