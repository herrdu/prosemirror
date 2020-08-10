import browser from "./browser";

export const domIndex = function (node: Node) {
  for (var index = 0; ; index++) {
    node = node.previousSibling;
    if (!node) return index;
  }
};

export const parentNode = function (node: any) {
  let parent = node.parentNode;
  return parent && parent.nodeType == 11 ? parent.host : parent;
};

export const textRange = function (node: any, from?: number, to?: number) {
  let range = document.createRange();
  range.setEnd(node, to == null ? node.nodeValue.length : to);
  range.setStart(node, from || 0);
  return range;
};

// Scans forward and backward through DOM positions equivalent to the
// given one to see if the two are in the same place (i.e. after a
// text node vs at the end of that text node)
export const isEquivalentPosition = function (node: any, off: number, targetNode: any, targetOff: number) {
  return targetNode && (scanFor(node, off, targetNode, targetOff, -1) || scanFor(node, off, targetNode, targetOff, 1));
};

const atomElements = /^(img|br|input|textarea|hr)$/i;

function scanFor(node: any, off: number, targetNode: any, targetOff: number, dir: number) {
  for (;;) {
    if (node == targetNode && off == targetOff) return true;
    if (off == (dir < 0 ? 0 : nodeSize(node))) {
      let parent = node.parentNode;
      if (
        parent.nodeType != 1 ||
        hasBlockDesc(node) ||
        atomElements.test(node.nodeName) ||
        node.contentEditable == "false"
      )
        return false;
      off = domIndex(node) + (dir < 0 ? 0 : 1);
      node = parent;
    } else if (node.nodeType == 1) {
      node = node.childNodes[off + (dir < 0 ? -1 : 0)];
      if (node.contentEditable == "false") return false;
      off = dir < 0 ? nodeSize(node) : 0;
    } else {
      return false;
    }
  }
}

export function nodeSize(node: Node) {
  return node.nodeType == 3 ? node.nodeValue.length : node.childNodes.length;
}

export function isOnEdge(node: Node, offset: number, parent: Node) {
  for (let atStart = offset == 0, atEnd = offset == nodeSize(node); atStart || atEnd; ) {
    if (node == parent) return true;
    let index = domIndex(node);
    node = node.parentNode;
    if (!node) return false;
    atStart = atStart && index == 0;
    atEnd = atEnd && index == nodeSize(node);
  }
}

function hasBlockDesc(dom: any) {
  let desc: any;
  for (let cur = dom; cur; cur = cur.parentNode) if ((desc = cur.pmViewDesc)) break;
  return desc && desc.node && desc.node.isBlock && (desc.dom == dom || desc.contentDOM == dom);
}

// Work around Chrome issue https://bugs.chromium.org/p/chromium/issues/detail?id=447523
// (isCollapsed inappropriately returns true in shadow dom)
export const selectionCollapsed = function (domSel: any) {
  let collapsed = domSel.isCollapsed;
  if (collapsed && browser.chrome && domSel.rangeCount && !domSel.getRangeAt(0).collapsed) collapsed = false;
  return collapsed;
};

export function keyEvent(keyCode: number, key: string) {
  let event = document.createEvent("Event") as Event & {
    keyCode: number;
    code: string;
    key: string;
  };
  event.initEvent("keydown", true, true);
  event.keyCode = keyCode;
  event.key = event.code = key;
  return event;
}
