import {
  ViewPlugin,
  Decoration,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import LinkifyIt from "linkify-it";

const linkify = new LinkifyIt();

const marker = Decoration.mark({ class: "cm-md-marker" });
const strong = Decoration.mark({ class: "cm-strong" });
const emphasis = Decoration.mark({ class: "cm-em" });
const strikethrough = Decoration.mark({ class: "cm-strikethrough" });
const inlineCode = Decoration.mark({ class: "cm-inline-code" });
const spoiler = Decoration.mark({ class: "cm-spoiler" });
const underline = Decoration.mark({ class: "cm-underline" });
const autolink = Decoration.mark({ class: "cm-autolink" });
const linkText = Decoration.mark({ class: "cm-link-text" });
const urlMark = Decoration.mark({ class: "cm-url" });
const subtextLine = Decoration.line({ class: "cm-subtext" });

const headingLine: Record<number, Decoration> = {
  1: Decoration.line({ class: "cm-heading cm-heading-1" }),
  2: Decoration.line({ class: "cm-heading cm-heading-2" }),
  3: Decoration.line({ class: "cm-heading cm-heading-3" }),
};
const blockquoteLine = Decoration.line({ class: "cm-blockquote" });
const codeBlockLine = Decoration.line({ class: "cm-codeblock-line" });

const markerNodes = new Set([
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "HeaderMark",
  "QuoteMark",
  "LinkMark",
  "CodeInfo",
  "SpoilerMark",
  "UnderlineMark",
  "SubtextMark",
]);

const contentMarkByParent: Record<string, Decoration> = {
  StrongEmphasis: strong,
  Emphasis: emphasis,
  Strikethrough: strikethrough,
  InlineCode: inlineCode,
  Spoiler: spoiler,
  Underline: underline,
};

type Deco = { from: number; to: number; deco: Decoration };

function buildDecorations(view: EditorView): DecorationSet {
  const decos: Deco[] = [];

  function add(from: number, to: number, deco: Decoration) {
    decos.push({ from, to, deco });
  }

  function addLine(lineFrom: number, deco: Decoration) {
    decos.push({ from: lineFrom, to: lineFrom, deco });
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const headingMatch = node.name.match(/^ATXHeading(\d)$/);
        if (headingMatch) {
          const level = Number(headingMatch[1]);
          const deco = headingLine[level];
          if (deco) addLine(view.state.doc.lineAt(node.from).from, deco);
          return;
        }

        if (node.name === "Blockquote") {
          const startLine = view.state.doc.lineAt(node.from);
          const endLine = view.state.doc.lineAt(node.to);
          for (let i = startLine.number; i <= endLine.number; i++) {
            addLine(view.state.doc.line(i).from, blockquoteLine);
          }
          return;
        }

        if (node.name === "Subtext") {
          addLine(view.state.doc.lineAt(node.from).from, subtextLine);
          return;
        }

        if (node.name === "FencedCode") {
          const startLine = view.state.doc.lineAt(node.from);
          const endLine = view.state.doc.lineAt(node.to);
          for (let i = startLine.number; i <= endLine.number; i++) {
            addLine(view.state.doc.line(i).from, codeBlockLine);
          }
          return;
        }

        if (markerNodes.has(node.name)) {
          if (node.from < node.to) add(node.from, node.to, marker);
          return;
        }

        const contentDeco = contentMarkByParent[node.name];
        if (contentDeco) {
          if (node.from < node.to) add(node.from, node.to, contentDeco);
          return;
        }

        if (node.name === "Autolink") {
          if (node.from < node.to) add(node.from, node.to, autolink);
          return;
        }

        if (node.name === "Link") {
          const cursor = node.node.cursor();
          if (cursor.firstChild()) {
            do {
              if (cursor.name === "LinkMark") {
                add(cursor.from, cursor.to, marker);
              } else if (cursor.name === "URL") {
                add(cursor.from, cursor.to, urlMark);
              } else if (cursor.from < cursor.to) {
                add(cursor.from, cursor.to, linkText);
              }
            } while (cursor.nextSibling());
          }
          return false;
        }
      },
    });
  }

  // Bare URL detection via linkify-it
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    const matches = linkify.match(text);
    if (matches) {
      for (const m of matches) {
        const start = from + m.index;
        const end = from + m.lastIndex;
        const overlap = decos.some((d) => d.from <= start && d.to >= end);
        if (!overlap) {
          decos.push({ from: start, to: end, deco: autolink });
        }
      }
    }
  }

  decos.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to, deco } of decos) {
    builder.add(from, to, deco);
  }
  return builder.finish();
}

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.state) !== syntaxTree(update.startState)
      ) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);
