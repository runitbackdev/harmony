import { getParser, renderHighlightedCode, renderPlainCode } from "./highlighter";

export { tokyoNightStyle } from "./tokyo-night";

export async function highlightCode(code: string, lang: string): Promise<string> {
  const parser = await getParser(lang);
  if (!parser) return renderPlainCode(code, lang);
  return renderHighlightedCode(code, parser, lang);
}
