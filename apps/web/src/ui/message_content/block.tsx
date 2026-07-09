import { useEffect, useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils";
import { loadLang, tokenize } from "../highlight/shiki";

// #region Blockquote & Heading

function Blockquote({ className, ...props }: ComponentPropsWithoutRef<"blockquote">) {
  return (
    <blockquote
      className={cn("my-1 border-l-[3px] border-line pl-3 text-sub", className)}
      {...props}
    />
  );
}

const HEADING_STYLES = {
  1: "text-xl font-bold",
  2: "text-lg font-bold",
  3: "text-base font-bold",
} as const;

interface HeadingProps extends ComponentPropsWithoutRef<"h1"> {
  level: 1 | 2 | 3;
}

function Heading({ level, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return <Tag className={cn("my-1", HEADING_STYLES[level], className)} {...props} />;
}

// #endregion

// #region CodeBlock

interface CodeBlockProps extends ComponentPropsWithoutRef<"pre"> {
  code: string;
  lang?: string;
}

function CodeBlock({ code, lang, className, ...props }: CodeBlockProps) {
  const lines = useShikiTokens(code, lang);

  return (
    <pre
      className={cn(
        "my-1 overflow-x-auto rounded-md bg-soft px-3 py-2 text-[0.8125rem]",
        className,
      )}
      {...props}
    >
      <code className={lang ? `language-${lang}` : undefined}>
        {lines
          ? lines.map((line, i) => (
              <span key={i}>
                {line.map((token, j) => (
                  <span key={j} style={{ color: token.color }}>
                    {token.content}
                  </span>
                ))}
                {"\n"}
              </span>
            ))
          : code}
      </code>
    </pre>
  );
}

function useShikiTokens(code: string, lang?: string) {
  const [loadedLang, setLoadedLang] = useState<string>();

  useEffect(() => {
    if (!lang) return;
    let live = true;
    void loadLang(lang).then((ok) => {
      if (live && ok) setLoadedLang(lang);
    });
    return () => {
      live = false;
    };
  }, [lang]);

  return lang && loadedLang === lang ? tokenize(code, lang) : undefined;
}

// #endregion

export { Blockquote, Heading, CodeBlock, HEADING_STYLES };
