import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Typography from "@tiptap/extension-typography";
import { Spoiler } from "./spoiler";
import { Subtext } from "./subtext";

export const baseExtensions = [
  StarterKit.configure({
    underline: false,
    link: false,
    heading: { levels: [1, 2, 3] },
    horizontalRule: false,
  }),
  Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  Underline,
  Typography,
  Spoiler,
  Subtext,
];

export const editorAttributes = {
  class: "composer rich-text",
};
