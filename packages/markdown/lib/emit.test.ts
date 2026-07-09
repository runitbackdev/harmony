import { expect, test } from "vitest";
import { emitMatrixHtml } from "./emit.ts";

test("plain text emits nothing", () => {
  expect(emitMatrixHtml("just a message")).toBeUndefined();
});

test("empty string emits nothing", () => {
  expect(emitMatrixHtml("")).toBeUndefined();
});

test("multi-line single paragraph emits nothing", () => {
  expect(emitMatrixHtml("line one\nline two")).toBeUndefined();
});

test("bold", () => {
  expect(emitMatrixHtml("**bold** text")).toMatchInlineSnapshot(
    `"<span><strong>bold</strong> text</span>"`,
  );
});

test("full inline set", () => {
  expect(emitMatrixHtml("*i* **b** __u__ ~~s~~ ||sp|| `c`")).toMatchInlineSnapshot(
    `"<span><em>i</em> <strong>b</strong> <u>u</u> <del>s</del> <span data-mx-spoiler="">sp</span> <code>c</code></span>"`,
  );
});

test("newline inside formatted paragraph becomes br", () => {
  expect(emitMatrixHtml("**a**\nb")).toMatchInlineSnapshot(
    `"<span><strong>a</strong><br>b</span>"`,
  );
});

test("paragraphs joined with double br", () => {
  expect(emitMatrixHtml("**first**\n\nsecond")).toMatchInlineSnapshot(
    `"<span><strong>first</strong></span><br><br><span>second</span>"`,
  );
});

test("heading then paragraph has no br join", () => {
  expect(emitMatrixHtml("# title\nbody")).toMatchInlineSnapshot(
    `"<h1>title</h1><span>body</span>"`,
  );
});

test("subtext", () => {
  expect(emitMatrixHtml("-# aside")).toMatchInlineSnapshot(
    `"<small data-subtext="">aside</small>"`,
  );
});

test("blockquote with inline formatting", () => {
  expect(emitMatrixHtml("> quoted *text*\n> more")).toMatchInlineSnapshot(
    `"<blockquote>quoted <em>text</em><br>more</blockquote>"`,
  );
});

test("mention", () => {
  expect(emitMatrixHtml("hi [@u](https://matrix.to/#/@u:example.org)")).toMatchInlineSnapshot(
    `"<span>hi <a href="https://matrix.to/#/@u:example.org" rel="noopener noreferrer" target="_blank">@u</a></span>"`,
  );
});

test("link and autolink get rel and target", () => {
  expect(emitMatrixHtml("[x](https://a.com) https://b.com")).toMatchInlineSnapshot(
    `"<span><a href="https://a.com" rel="noopener noreferrer" target="_blank">x</a> <a href="https://b.com" rel="noopener noreferrer" target="_blank">https://b.com</a></span>"`,
  );
});

test("codeblock with lang", () => {
  expect(emitMatrixHtml("```ts\nconst a = 1 < 2\n```")).toMatchInlineSnapshot(
    `"<pre><code class="language-ts">const a = 1 &lt; 2</code></pre>"`,
  );
});

test("unclosed codeblock", () => {
  expect(emitMatrixHtml("```\nraw & <b>html</b>")).toMatchInlineSnapshot(
    `"<pre><code>raw &amp; &lt;b&gt;html&lt;/b&gt;</code></pre>"`,
  );
});

test("escaped markers emit literally", () => {
  expect(emitMatrixHtml("\\*literal\\*")).toMatchInlineSnapshot(`"<span>*literal*</span>"`);
});

test("html in content is escaped", () => {
  expect(emitMatrixHtml('**<script>alert("&")</script>**')).toMatchInlineSnapshot(
    `"<span><strong>&lt;script&gt;alert(&quot;&amp;&quot;)&lt;/script&gt;</strong></span>"`,
  );
});
