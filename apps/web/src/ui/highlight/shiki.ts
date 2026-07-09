import {
  createHighlighterCoreSync,
  type HighlighterCore,
  type LanguageRegistration,
  type ThemedToken,
} from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import tokyoNight from "@shikijs/themes/tokyo-night";

export type { ThemedToken };

type LangModule = { default: LanguageRegistration[] };

const LANG_LOADERS: Record<string, () => Promise<LangModule>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  js: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  ts: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  python: () => import("@shikijs/langs/python"),
  py: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  rs: () => import("@shikijs/langs/rust"),
  go: () => import("@shikijs/langs/go"),
  ruby: () => import("@shikijs/langs/ruby"),
  rb: () => import("@shikijs/langs/ruby"),
  java: () => import("@shikijs/langs/java"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  json: () => import("@shikijs/langs/json"),
  sql: () => import("@shikijs/langs/sql"),
  yaml: () => import("@shikijs/langs/yaml"),
  yml: () => import("@shikijs/langs/yaml"),
  xml: () => import("@shikijs/langs/xml"),
  markdown: () => import("@shikijs/langs/markdown"),
  md: () => import("@shikijs/langs/markdown"),
  cpp: () => import("@shikijs/langs/cpp"),
  "c++": () => import("@shikijs/langs/cpp"),
  c: () => import("@shikijs/langs/c"),
  php: () => import("@shikijs/langs/php"),
  sass: () => import("@shikijs/langs/sass"),
  scss: () => import("@shikijs/langs/scss"),
};

let highlighter: HighlighterCore | undefined;
const pending = new Map<string, Promise<unknown>>();

function instance() {
  highlighter ??= createHighlighterCoreSync({
    themes: [tokyoNight],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

function loadedId(lang: string) {
  const id = lang.toLowerCase();
  return instance().getLoadedLanguages().includes(id) ? id : undefined;
}

export async function loadLang(lang: string) {
  const id = lang.toLowerCase();
  const loader = LANG_LOADERS[id];
  if (!loader) return false;
  if (loadedId(id)) return true;

  let load = pending.get(id);
  if (!load) {
    load = loader().then((mod) => instance().loadLanguage(mod.default));
    pending.set(id, load);
  }
  await load;
  return true;
}

export function tokenize(code: string, lang: string): ThemedToken[][] | undefined {
  const id = loadedId(lang);
  if (id === undefined) return undefined;
  return instance().codeToTokensBase(code, { lang: id, theme: "tokyo-night" });
}
