import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "font",
  "del",
  "h1",
  "h2",
  "h3",
  "blockquote",
  "p",
  "a",
  "ul",
  "ol",
  "sup",
  "sub",
  "li",
  "b",
  "i",
  "u",
  "strong",
  "em",
  "strike",
  "code",
  "br",
  "div",
  "pre",
  "span",
  "img",
  "small",
  "mx-reply",
];

const ALLOWED_ATTR = [
  "data-mx-bg-color",
  "data-mx-color",
  "name",
  "target",
  "href",
  "rel",
  "width",
  "height",
  "alt",
  "title",
  "src",
  "start",
  "class",
  "data-mx-spoiler",
  "data-subtext",
];

const ALLOWED_URI_REGEXP = /^(?:https?|ftp|mailto|magnet|mxc):/i;

const purify = DOMPurify();

purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }

  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (!src.startsWith("mxc://")) {
      node.removeAttribute("src");
    }
  }

  if (node.tagName === "CODE") {
    const cls = node.getAttribute("class") ?? "";
    if (cls && !/^language-\w+$/.test(cls)) {
      node.removeAttribute("class");
    }
  }

  if (node.tagName === "SPAN") {
    const mxColor = node.getAttribute("data-mx-color") ?? "";
    if (/^#[0-9a-fA-F]{6}$/.test(mxColor)) {
      (node as HTMLElement).style.color = mxColor;
      node.removeAttribute("data-mx-color");
    }
  }
});

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP,
  });
}
