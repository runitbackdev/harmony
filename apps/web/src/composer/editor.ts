import { keymap, EditorView } from "@codemirror/view";
import { EditorState, Compartment, Prec, type Extension } from "@codemirror/state";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { GFM } from "@lezer/markdown";
import { syntaxTree, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { completionStatus } from "@codemirror/autocomplete";
import { tokyoNightStyle } from "@/composer/highlight";
import { markdownDecorations } from "./decorations";
import { discordSyntax } from "./discord-syntax";
import { emojiShortcodeReplace } from "./emoji-source";
export { createMentionSource } from "./mention-source";

export type SendConfig = {
  onSend: (body: string) => void;
};

export type EditConfig = {
  onEdit: (body: string) => void;
  onCancel: () => void;
};

function isOpeningFence(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  let opening = false;
  syntaxTree(view.state).iterate({
    from: 0,
    to: view.state.doc.length,
    enter(node) {
      if (node.name === "FencedCode" && pos >= node.from && pos <= node.to) {
        const firstLine = view.state.doc.lineAt(node.from);
        const lastLine = view.state.doc.lineAt(node.to);
        opening = firstLine.number === lastLine.number;
        return false;
      }
    },
  });
  return opening;
}

function handleCodeBlockEnter(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);

  if (/^```\w*$/.test(line.text.trim()) && isOpeningFence(view)) {
    const indent = line.text.match(/^(\s*)/)?.[1] ?? "";
    view.dispatch({
      changes: { from: line.to, insert: `\n${indent}\n${indent}\`\`\`` },
      selection: { anchor: line.to + 1 + indent.length },
    });
    return true;
  }

  if (inFencedCode(view)) {
    view.dispatch(view.state.replaceSelection("\n"));
    return true;
  }

  return false;
}

const newline = keymap.of([
  {
    key: "Shift-Enter",
    run: (view) => {
      view.dispatch(view.state.replaceSelection("\n"));
      return true;
    },
  },
]);

export function sendKeymap({ onSend }: SendConfig): Extension {
  return Prec.high(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (completionStatus(view.state)) return false;
          if (handleCodeBlockEnter(view)) return true;

          const body = view.state.doc.toString().trim();
          if (!body) return true;
          onSend(body);
          view.dispatch({ changes: { from: 0, to: view.state.doc.length } });
          return true;
        },
      },
    ]),
  );
}

export function editKeymap({ onEdit, onCancel }: EditConfig): Extension {
  return Prec.high(
    keymap.of([
      {
        key: "Escape",
        run: () => {
          onCancel();
          return true;
        },
      },
      {
        key: "Enter",
        run: (view) => {
          if (completionStatus(view.state)) return false;
          if (handleCodeBlockEnter(view)) return true;

          const body = view.state.doc.toString().trim();
          if (!body) return true;
          onEdit(body);
          return true;
        },
      },
    ]),
  );
}

function inFencedCode(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  let inside = false;
  syntaxTree(view.state).iterate({
    from: 0,
    to: view.state.doc.length,
    enter(node) {
      if (node.name === "FencedCode" && pos >= node.from && pos <= node.to) {
        inside = true;
        return false;
      }
    },
  });
  return inside;
}

const codeBlockKeymap = Prec.high(
  keymap.of([
    {
      key: "Tab",
      run: (view) => {
        if (!inFencedCode(view)) return false;
        view.dispatch(view.state.replaceSelection("  "));
        return true;
      },
    },
  ]),
);

const markdownLang = markdown({
  extensions: [GFM, ...discordSyntax],
  codeLanguages: languages,
});

const tokyoNightHighlight = syntaxHighlighting(HighlightStyle.define(tokyoNightStyle));

const baseTheme = EditorView.theme({
  "&": { outline: "none", fontFamily: "inherit" },
  ".cm-content": { padding: "0", fontFamily: "inherit", caretColor: "var(--color-surface-950-50)" },
  ".cm-line": { padding: "0 2px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
  "&.cm-focused": { outline: "none" },
  ".cm-tooltip-autocomplete": {
    backgroundColor: "var(--color-surface-100-900)",
    border: "1px solid var(--color-surface-200-800)",
    borderRadius: "0.5rem",
    padding: "0.25rem",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
    fontFamily: '"Twemoji", var(--base-font-family)',
  },
  ".cm-tooltip-autocomplete ul": {
    maxHeight: "16rem",
    fontFamily: "inherit",
  },
  ".cm-tooltip-autocomplete li": {
    padding: "0.375rem 0.5rem",
    borderRadius: "0.25rem",
    fontSize: "0.875rem",
    fontFamily: "inherit",
  },
  ".cm-tooltip-autocomplete li[aria-selected]": {
    backgroundColor: "var(--color-surface-200-800)",
  },
});

function wrapWith(view: EditorView, marker: string): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) {
    view.dispatch({
      changes: { from, insert: marker + marker },
      selection: { anchor: from + marker.length },
    });
  } else {
    view.dispatch({
      changes: [
        { from, insert: marker },
        { from: to, insert: marker },
      ],
      selection: { anchor: from + marker.length, head: to + marker.length },
    });
  }
  return true;
}

const formattingKeymap = Prec.highest(
  keymap.of([
    { key: "Mod-b", run: (v) => wrapWith(v, "**"), preventDefault: true },
    { key: "Mod-i", run: (v) => wrapWith(v, "*"), preventDefault: true },
    { key: "Mod-u", run: (v) => wrapWith(v, "__"), preventDefault: true },
    { key: "Mod-Shift-x", run: (v) => wrapWith(v, "~~"), preventDefault: true },
    { key: "Mod-Shift-s", run: (v) => wrapWith(v, "||"), preventDefault: true },
    { key: "Mod-e", run: (v) => wrapWith(v, "`"), preventDefault: true },
  ]),
);

export const baseExtensions: Extension[] = [
  markdownLang,
  tokyoNightHighlight,
  markdownDecorations,
  emojiShortcodeReplace(),
  history(),
  EditorView.lineWrapping,
  baseTheme,
  newline,
  codeBlockKeymap,
  formattingKeymap,
  keymap.of([...defaultKeymap, ...historyKeymap]),
];

export { Compartment, EditorState, EditorView };
