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
  "data-mx-mention",
];

const ALLOWED_URI_REGEXP = /^(?:https?|ftp|mailto|magnet|mxc):/i;

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const LANGUAGE_CLASS = /^language-\w+$/;
const MATRIX_USER_LINK = "https://matrix.to/#/@";

type ElementRule = (el: Element) => void;

function enforceSafeLinkAttrs(el: Element) {
  el.setAttribute("rel", "noopener noreferrer");
  el.setAttribute("target", "_blank");
}

function tagMatrixUserMentions(el: Element) {
  const href = el.getAttribute("href") ?? "";
  if (href.startsWith(MATRIX_USER_LINK)) {
    el.setAttribute("data-mx-mention", "user");
  }
}

function stripNonMxcImageSrc(el: Element) {
  const src = el.getAttribute("src") ?? "";
  if (!src.startsWith("mxc://")) {
    el.removeAttribute("src");
  }
}

function stripInvalidLanguageClass(el: Element) {
  const cls = el.getAttribute("class");
  if (cls && !LANGUAGE_CLASS.test(cls)) {
    el.removeAttribute("class");
  }
}

function inlineMxColor(el: Element) {
  const color = el.getAttribute("data-mx-color") ?? "";
  if (HEX_COLOR.test(color)) {
    (el as HTMLElement).style.color = color;
    el.removeAttribute("data-mx-color");
  }
}

const RULES: Record<string, ElementRule[]> = {
  A: [enforceSafeLinkAttrs, tagMatrixUserMentions],
  IMG: [stripNonMxcImageSrc],
  CODE: [stripInvalidLanguageClass],
  SPAN: [inlineMxColor],
};

const purify = DOMPurify();

purify.addHook("afterSanitizeAttributes", function (node) {
  const rules = RULES[node.tagName];
  if (!rules) return;
  for (const rule of rules) rule(node);
});

export function sanitizeHtml(html: string): string {
  return purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ["data-mx-mention"],
    ALLOWED_URI_REGEXP,
  });
}
