import { Plugin, EditorState } from "../state";
import { dropPoint } from "../transform";
import { EditorView } from "../view";

// :: (options: ?Object) → Plugin
// Create a plugin that, when added to a ProseMirror instance,
// causes a decoration to show up at the drop position when something
// is dragged over the editor.
//
//   options::- These options are supported:
//
//     color:: ?string
//     The color of the cursor. Defaults to `black`.
//
//     width:: ?number
//     The precise width of the cursor in pixels. Defaults to 1.
//
//     class:: ?string
//     A CSS class name to add to the cursor element.
export function dropCursor(options: { [key: string]: any } = {}) {
  return new Plugin({
    view(editorView) {
      return new DropCursorView(editorView, options);
    },
  });
}

class DropCursorView {
  editorView: EditorView;
  width: number;
  color: string;
  class: string;
  cursorPos: any;
  element: HTMLElement;
  timeout: any;
  handlers: Array<{ name: string; handler: (e: MouseEvent) => (e?: MouseEvent) => void }>;

  constructor(editorView: EditorView, options: { [key: string]: any }) {
    this.editorView = editorView;
    this.width = options.width || 1;
    this.color = options.color || "black";
    this.class = options.class;
    this.cursorPos = null;
    this.element = null;
    this.timeout = null;

    this.handlers = ["dragover", "dragend", "drop", "dragleave"].map((name) => {
      let handler = (e?: MouseEvent) => this[name](e);
      editorView.dom.addEventListener(name, handler);
      return { name, handler };
    });
  }

  destroy() {
    this.handlers.forEach(({ name, handler }) => this.editorView.dom.removeEventListener(name, handler));
  }

  update(editorView: EditorView, prevState: EditorState) {
    if (this.cursorPos != null && prevState.doc != editorView.state.doc) this.updateOverlay();
  }

  setCursor(pos: number) {
    if (pos == this.cursorPos) return;
    this.cursorPos = pos;
    if (pos == null) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    } else {
      this.updateOverlay();
    }
  }

  updateOverlay() {
    let $pos = this.editorView.state.doc.resolve(this.cursorPos),
      rect: any;
    if (!$pos.parent.inlineContent) {
      let before = $pos.nodeBefore,
        after = $pos.nodeAfter;
      if (before || after) {
        let nodeRect = (this.editorView.nodeDOM(
          this.cursorPos - (before ? before.nodeSize : 0)
        ) as HTMLElement).getBoundingClientRect();
        let top = before ? nodeRect.bottom : nodeRect.top;
        if (before && after)
          top = (top + (this.editorView.nodeDOM(this.cursorPos) as HTMLElement).getBoundingClientRect().top) / 2;
        rect = { left: nodeRect.left, right: nodeRect.right, top: top - this.width / 2, bottom: top + this.width / 2 };
      }
    }
    if (!rect) {
      let coords = this.editorView.coordsAtPos(this.cursorPos);
      rect = {
        left: coords.left - this.width / 2,
        right: coords.left + this.width / 2,
        top: coords.top,
        bottom: coords.bottom,
      };
    }

    let parent = (this.editorView.dom as HTMLElement).offsetParent;
    if (!this.element) {
      this.element = parent.appendChild(document.createElement("div"));
      if (this.class) this.element.className = this.class;
      this.element.style.cssText =
        "position: absolute; z-index: 50; pointer-events: none; background-color: " + this.color;
    }
    let parentRect =
      !parent || (parent == document.body && getComputedStyle(parent).position == "static")
        ? { left: -pageXOffset, top: -pageYOffset }
        : parent.getBoundingClientRect();
    this.element.style.left = rect.left - parentRect.left + "px";
    this.element.style.top = rect.top - parentRect.top + "px";
    this.element.style.width = rect.right - rect.left + "px";
    this.element.style.height = rect.bottom - rect.top + "px";
  }

  scheduleRemoval(timeout: number) {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.setCursor(null), timeout);
  }

  dragover(event: MouseEvent) {
    if (!this.editorView.editable) return;
    let pos = this.editorView.posAtCoords({ left: event.clientX, top: event.clientY });
    if (pos) {
      let target = pos.pos;
      if (this.editorView.dragging && this.editorView.dragging.slice) {
        target = dropPoint(this.editorView.state.doc, target, this.editorView.dragging.slice);
        if (target == null) target = pos.pos;
      }
      this.setCursor(target);
      this.scheduleRemoval(5000);
    }
  }

  dragend() {
    this.scheduleRemoval(20);
  }

  drop() {
    this.scheduleRemoval(20);
  }

  dragleave(event: MouseEvent) {
    if (event.target == this.editorView.dom || !this.editorView.dom.contains(event.relatedTarget as Node))
      this.setCursor(null);
  }
}
