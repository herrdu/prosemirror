// This file defines a number of helpers for wiring up user input to
// table-related functionality.

import { Slice, Fragment } from "../model";
import { Selection, TextSelection, EditorState, Transaction } from "../state";
import { keydownHandler } from "../keymap";

import { key, nextCell, cellAround, inSameTable, isInTable, selectionCell } from "./util";
import { CellSelection } from "./cellselection";
import { TableMap } from "./tablemap";
import { pastedCells, fitSlice, clipCells, insertCells } from "./copypaste";
import { tableNodeTypes } from "./schema";
import { EditorView } from "../view";

export const handleKeyDown = keydownHandler({
  ArrowLeft: arrow("horiz", -1),
  ArrowRight: arrow("horiz", 1),
  ArrowUp: arrow("vert", -1),
  ArrowDown: arrow("vert", 1),

  "Shift-ArrowLeft": shiftArrow("horiz", -1),
  "Shift-ArrowRight": shiftArrow("horiz", 1),
  "Shift-ArrowUp": shiftArrow("vert", -1),
  "Shift-ArrowDown": shiftArrow("vert", 1),

  Backspace: deleteCellSelection,
  "Mod-Backspace": deleteCellSelection,
  Delete: deleteCellSelection,
  "Mod-Delete": deleteCellSelection,
});

function maybeSetSelection(state: EditorState, dispatch?: (tr: Transaction) => boolean, selection?: Selection) {
  if (selection.eq(state.selection)) return false;
  if (dispatch) dispatch(state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function arrow(axis: string, dir: number) {
  return (state: EditorState, dispatch?: (tr: Transaction) => boolean, view?: EditorView) => {
    let sel = state.selection;
    if (sel instanceof CellSelection) {
      return maybeSetSelection(state, dispatch, Selection.near(sel.$headCell, dir));
    }
    if (axis != "horiz" && !sel.empty) return false;
    let end = atEndOfCell(view, axis, dir);
    if (end == null) return false;
    if (axis == "horiz") {
      return maybeSetSelection(state, dispatch, Selection.near(state.doc.resolve(sel.head + dir), dir));
    } else {
      let $cell = state.doc.resolve(end),
        $next = nextCell($cell, axis, dir),
        newSel;
      if ($next) newSel = Selection.near($next, 1);
      else if (dir < 0) newSel = Selection.near(state.doc.resolve($cell.before(-1)), -1);
      else newSel = Selection.near(state.doc.resolve($cell.after(-1)), 1);
      return maybeSetSelection(state, dispatch, newSel);
    }
  };
}

function shiftArrow(axis: string, dir: number) {
  return (state: EditorState, dispatch?: (tr: Transaction) => boolean, view?: EditorView) => {
    let sel = state.selection;
    if (!(sel instanceof CellSelection)) {
      let end = atEndOfCell(view, axis, dir);
      if (end == null) return false;
      sel = new CellSelection(state.doc.resolve(end));
    }
    let $head = nextCell((sel as any).$headCell, axis, dir);
    if (!$head) return false;
    return maybeSetSelection(state, dispatch, new CellSelection((sel as any).$anchorCell, $head));
  };
}

function deleteCellSelection(state: EditorState, dispatch?: (tr: Transaction) => boolean) {
  let sel = state.selection;
  if (!(sel instanceof CellSelection)) return false;
  if (dispatch) {
    let tr = state.tr,
      baseContent = tableNodeTypes(state.schema).cell.createAndFill().content;
    sel.forEachCell((cell, pos) => {
      if (!cell.content.eq(baseContent))
        tr.replace(tr.mapping.map(pos + 1), tr.mapping.map(pos + cell.nodeSize - 1), new Slice(baseContent, 0, 0));
    });
    if (tr.docChanged) dispatch(tr);
  }
  return true;
}

export function handleTripleClick(view: EditorView, pos: number) {
  let doc = view.state.doc,
    $cell = cellAround(doc.resolve(pos));
  if (!$cell) return false;
  view.dispatch(view.state.tr.setSelection(new CellSelection($cell)));
  return true;
}

export function handlePaste(view: EditorView, _: any, slice: Slice) {
  if (!isInTable(view.state)) return false;
  let cells = pastedCells(slice),
    sel = view.state.selection;
  if (sel instanceof CellSelection) {
    if (!cells)
      cells = { width: 1, height: 1, rows: [Fragment.from(fitSlice(tableNodeTypes(view.state.schema).cell, slice))] };
    let table = sel.$anchorCell.node(-1),
      start = sel.$anchorCell.start(-1);
    let rect = TableMap.get(table).rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
    cells = clipCells(cells, rect.right - rect.left, rect.bottom - rect.top);
    insertCells(view.state, view.dispatch, start, rect, cells);
    return true;
  } else if (cells) {
    let $cell = selectionCell(view.state),
      start = $cell.start(-1);
    insertCells(view.state, view.dispatch, start, TableMap.get($cell.node(-1)).findCell($cell.pos - start), cells);
    return true;
  } else {
    return false;
  }
}

export function handleMouseDown(view: EditorView, startEvent: MouseEvent) {
  if (startEvent.ctrlKey || startEvent.metaKey) return;

  let startDOMCell = domInCell(view, startEvent.target as Node),
    $anchor: any;
  if (startEvent.shiftKey && view.state.selection instanceof CellSelection) {
    // Adding to an existing cell selection
    setCellSelection(view.state.selection.$anchorCell, startEvent);
    startEvent.preventDefault();
  } else if (
    startEvent.shiftKey &&
    startDOMCell &&
    ($anchor = cellAround(view.state.selection.$anchor)) != null &&
    cellUnderMouse(view, startEvent).pos != $anchor.pos
  ) {
    // Adding to a selection that starts in another cell (causing a
    // cell selection to be created).
    setCellSelection($anchor, startEvent);
    startEvent.preventDefault();
  } else if (!startDOMCell) {
    // Not in a cell, let the default behavior happen.
    return false;
  }

  // Create and dispatch a cell selection between the given anchor and
  // the position under the mouse.
  function setCellSelection($anchor: any, event: MouseEvent) {
    let $head = cellUnderMouse(view, event);
    let starting = key.getState(view.state) == null;
    if (!$head || !inSameTable($anchor, $head)) {
      if (starting) $head = $anchor;
      else return;
    }
    let selection = new CellSelection($anchor, $head);
    if (starting || !view.state.selection.eq(selection)) {
      let tr = view.state.tr.setSelection(selection);
      if (starting) tr.setMeta(key, $anchor.pos);
      view.dispatch(tr);
    }
  }

  // Stop listening to mouse motion events.
  function stop() {
    view.root.removeEventListener("mouseup", stop);
    view.root.removeEventListener("dragstart", stop);
    view.root.removeEventListener("mousemove", move);
    if (key.getState(view.state) != null) view.dispatch(view.state.tr.setMeta(key, -1));
  }

  function move(event: MouseEvent) {
    let anchor = key.getState(view.state),
      $anchor: any;
    if (anchor != null) {
      // Continuing an existing cross-cell selection
      $anchor = view.state.doc.resolve(anchor);
    } else if (domInCell(view, event.target as Node) != startDOMCell) {
      // Moving out of the initial cell -- start a new cell selection
      $anchor = cellUnderMouse(view, startEvent);
      if (!$anchor) return stop();
    }
    if ($anchor) setCellSelection($anchor, event);
  }
  view.root.addEventListener("mouseup", stop);
  view.root.addEventListener("dragstart", stop);
  view.root.addEventListener("mousemove", move);
}

// Check whether the cursor is at the end of a cell (so that further
// motion would move out of the cell)
function atEndOfCell(view: EditorView, axis: string, dir: number) {
  if (!(view.state.selection instanceof TextSelection)) return null;
  let { $head } = view.state.selection;
  for (let d = $head.depth - 1; d >= 0; d--) {
    let parent = $head.node(d),
      index = dir < 0 ? $head.index(d) : $head.indexAfter(d);
    if (index != (dir < 0 ? 0 : parent.childCount)) return null;
    if (parent.type.spec.tableRole == "cell" || parent.type.spec.tableRole == "header_cell") {
      let cellPos = $head.before(d);
      let dirStr = axis == "vert" ? (dir > 0 ? "down" : "up") : dir > 0 ? "right" : "left";
      return view.endOfTextblock(dirStr as any) ? cellPos : null;
    }
  }
  return null;
}

function domInCell(view: EditorView, dom: Node) {
  for (; dom && dom != view.dom; dom = dom.parentNode) if (dom.nodeName == "TD" || dom.nodeName == "TH") return dom;
}

function cellUnderMouse(view: EditorView, event: MouseEvent) {
  let mousePos = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!mousePos) return null;
  return mousePos ? cellAround(view.state.doc.resolve(mousePos.pos)) : null;
}
