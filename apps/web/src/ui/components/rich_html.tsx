import { createElement, type ReactNode } from "react";
import { cn } from "../utils";
import { sanitizeHtml } from "../sanitize";
import {
  Blockquote,
  CodeBlock,
  Heading,
  InlineCode,
  Link,
  MentionChip,
  Spoiler,
  Subtext,
  Underline,
} from "../message_content";

const MATRIX_TO = "https://matrix.to/#/";

const PASSTHROUGH_TAGS = new Set([
  "font",
  "del",
  "p",
  "ul",
  "ol",
  "sup",
  "sub",
  "li",
  "b",
  "i",
  "strong",
  "em",
  "strike",
  "br",
  "div",
  "span",
  "img",
  "small",
]);

const TAG_STYLES: Record<string, string> = {
  ul: "my-1 list-disc pl-5",
  ol: "my-1 list-decimal pl-5",
};

const PASSTHROUGH_ATTRS = new Set(["name", "width", "height", "alt", "title", "src", "start"]);

const VOID_TAGS = new Set(["br", "img"]);

function renderMatrixHtml(html: string): ReactNode {
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), "text/html");
  return renderNodes(doc.body.childNodes);
}

function renderNodes(nodes: NodeListOf<ChildNode>) {
  return Array.from(nodes, (node, key) => renderNode(node, key));
}

function renderNode(node: ChildNode, key: number): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (!(node instanceof HTMLElement)) return null;

  const tag = node.tagName.toLowerCase();

  switch (tag) {
    case "mx-reply":
      return null;
    case "a":
      return renderAnchor(node, key);
    case "pre":
      return renderPre(node, key);
    case "u":
      return <Underline key={key}>{renderNodes(node.childNodes)}</Underline>;
    case "blockquote":
      return <Blockquote key={key}>{renderNodes(node.childNodes)}</Blockquote>;
    case "code":
      return (
        <InlineCode key={key} className={node.getAttribute("class") ?? undefined}>
          {renderNodes(node.childNodes)}
        </InlineCode>
      );
    case "h1":
    case "h2":
    case "h3":
      return (
        <Heading key={key} level={Number(tag[1]) as 1 | 2 | 3}>
          {renderNodes(node.childNodes)}
        </Heading>
      );
  }

  if (tag === "span" && node.hasAttribute("data-mx-spoiler")) {
    return (
      <Spoiler key={key} title={node.getAttribute("data-mx-spoiler") || undefined}>
        {renderNodes(node.childNodes)}
      </Spoiler>
    );
  }

  if (tag === "small" && node.hasAttribute("data-subtext")) {
    return <Subtext key={key}>{renderNodes(node.childNodes)}</Subtext>;
  }

  if (PASSTHROUGH_TAGS.has(tag)) {
    const children = VOID_TAGS.has(tag) ? undefined : renderNodes(node.childNodes);
    const props = pickAttrs(node);
    const className = cn(TAG_STYLES[tag], props.className as string | undefined);
    return createElement(tag, { key, ...props, className: className || undefined }, children);
  }

  return <span key={key}>{renderNodes(node.childNodes)}</span>;
}

function renderAnchor(el: HTMLElement, key: number) {
  const href = el.getAttribute("href") ?? "";
  const children = renderNodes(el.childNodes);

  if (href.startsWith(`${MATRIX_TO}@`)) {
    return (
      <MentionChip key={key} userId={href.slice(MATRIX_TO.length)}>
        {children}
      </MentionChip>
    );
  }
  return (
    <Link key={key} href={href}>
      {children}
    </Link>
  );
}

function renderPre(el: HTMLElement, key: number) {
  const code = el.querySelector("code");
  const cls = code?.getAttribute("class") ?? "";
  const lang = cls.startsWith("language-") ? cls.slice("language-".length) : undefined;
  return <CodeBlock key={key} code={(code ?? el).textContent ?? ""} lang={lang} />;
}

function pickAttrs(el: HTMLElement) {
  const props: Record<string, unknown> = {};
  for (const attr of el.attributes) {
    if (attr.name === "class") {
      props.className = attr.value;
    } else if (PASSTHROUGH_ATTRS.has(attr.name) || attr.name.startsWith("data-")) {
      props[attr.name] = attr.value;
    }
  }
  if (el.style.color) props.style = { color: el.style.color };
  return props;
}

export { renderMatrixHtml };
