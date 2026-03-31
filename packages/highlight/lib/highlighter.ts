import { highlightCode, tagHighlighter } from "@lezer/highlight";
import type { Parser } from "@lezer/common";
import { tokyoNightStyle } from "./tokyo-night";

const colorHighlighter = tagHighlighter(
  tokyoNightStyle
    .filter((s): s is typeof s & { color: string } => "color" in s)
    .map((s) => ({
      tag: s.tag as never,
      class: s.color,
    })),
);

type LangModule = { parser: Parser };

const LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  javascript: () =>
    import("@codemirror/lang-javascript").then((m) => ({ parser: m.javascriptLanguage.parser })),
  js: () =>
    import("@codemirror/lang-javascript").then((m) => ({ parser: m.javascriptLanguage.parser })),
  typescript: () =>
    import("@codemirror/lang-javascript").then((m) => ({ parser: m.typescriptLanguage.parser })),
  ts: () =>
    import("@codemirror/lang-javascript").then((m) => ({ parser: m.typescriptLanguage.parser })),
  jsx: () => import("@codemirror/lang-javascript").then((m) => ({ parser: m.jsxLanguage.parser })),
  tsx: () => import("@codemirror/lang-javascript").then((m) => ({ parser: m.tsxLanguage.parser })),
  python: () =>
    import("@codemirror/lang-python").then((m) => ({ parser: m.pythonLanguage.parser })),
  py: () => import("@codemirror/lang-python").then((m) => ({ parser: m.pythonLanguage.parser })),
  rust: () => import("@codemirror/lang-rust").then((m) => ({ parser: m.rustLanguage.parser })),
  rs: () => import("@codemirror/lang-rust").then((m) => ({ parser: m.rustLanguage.parser })),
  go: () => import("@codemirror/lang-go").then((m) => ({ parser: m.goLanguage.parser })),
  java: () => import("@codemirror/lang-java").then((m) => ({ parser: m.javaLanguage.parser })),
  html: () => import("@codemirror/lang-html").then((m) => ({ parser: m.htmlLanguage.parser })),
  css: () => import("@codemirror/lang-css").then((m) => ({ parser: m.cssLanguage.parser })),
  json: () => import("@codemirror/lang-json").then((m) => ({ parser: m.jsonLanguage.parser })),
  sql: () =>
    import("@codemirror/lang-sql").then((m) => ({ parser: m.StandardSQL.language.parser })),
  yaml: () => import("@codemirror/lang-yaml").then((m) => ({ parser: m.yamlLanguage.parser })),
  xml: () => import("@codemirror/lang-xml").then((m) => ({ parser: m.xmlLanguage.parser })),
  markdown: () =>
    import("@codemirror/lang-markdown").then((m) => ({ parser: m.markdownLanguage.parser })),
  md: () =>
    import("@codemirror/lang-markdown").then((m) => ({ parser: m.markdownLanguage.parser })),
  cpp: () => import("@codemirror/lang-cpp").then((m) => ({ parser: m.cppLanguage.parser })),
  "c++": () => import("@codemirror/lang-cpp").then((m) => ({ parser: m.cppLanguage.parser })),
  c: () => import("@codemirror/lang-cpp").then((m) => ({ parser: m.cppLanguage.parser })),
  php: () => import("@codemirror/lang-php").then((m) => ({ parser: m.phpLanguage.parser })),
  sass: () => import("@codemirror/lang-sass").then((m) => ({ parser: m.sassLanguage.parser })),
  scss: () => import("@codemirror/lang-sass").then((m) => ({ parser: m.sassLanguage.parser })),
};

const parserCache = new Map<string, Parser>();

export async function getParser(lang: string): Promise<Parser | null> {
  if (!lang) return null;

  const cached = parserCache.get(lang);
  if (cached) return cached;

  const loader = LANG_LOADERS[lang.toLowerCase()];
  if (!loader) return null;

  try {
    const { parser } = await loader();
    parserCache.set(lang, parser);
    return parser;
  } catch {
    return null;
  }
}

function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"]/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!,
  );
}

export function renderHighlightedCode(code: string, parser: Parser, lang: string): string {
  const tree = parser.parse(code);
  let html = "";

  highlightCode(
    code,
    tree,
    colorHighlighter,
    (text, classes) => {
      const escaped = escapeHtml(text);
      if (classes) {
        html += `<span data-mx-color="${classes}">${escaped}</span>`;
      } else {
        html += escaped;
      }
    },
    () => {
      html += "\n";
    },
  );

  const safeLang = lang.replace(/[^a-zA-Z0-9_-]/g, "");
  return `<pre><code class="language-${safeLang}">${html}</code></pre>`;
}

export function renderPlainCode(code: string, lang: string): string {
  const safeLang = lang.replace(/[^a-zA-Z0-9_-]/g, "");
  return `<pre><code class="language-${safeLang}">${escapeHtml(code)}</code></pre>`;
}
