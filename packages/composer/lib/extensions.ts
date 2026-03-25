import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Typography from "@tiptap/extension-typography";
import { Spoiler } from "./spoiler";

export const baseExtensions = [
  StarterKit,
  Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  Underline,
  Typography,
  Spoiler,
];

export const editorAttributes = {
  class: "composer rich-text",
};
