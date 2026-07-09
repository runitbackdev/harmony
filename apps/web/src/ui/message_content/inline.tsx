import { useState, type ComponentPropsWithoutRef } from "react";
import { cn } from "../utils";

// #region Spoiler

interface SpoilerProps extends ComponentPropsWithoutRef<"span"> {
  forceRevealed?: boolean;
}

function Spoiler({ forceRevealed, className, onClick, ...props }: SpoilerProps) {
  const [revealed, setRevealed] = useState(false);
  const shown = forceRevealed || revealed;

  return (
    <span
      data-mx-spoiler=""
      role={shown ? undefined : "button"}
      className={cn(
        "rounded bg-soft px-0.5 transition-colors duration-150",
        !shown && "cursor-pointer text-transparent",
        className,
      )}
      onClick={(event) => {
        if (!shown) {
          event.stopPropagation();
          setRevealed(true);
        }
        onClick?.(event);
      }}
      {...props}
    />
  );
}

// #endregion

// #region Basic wrappers

function Underline(props: ComponentPropsWithoutRef<"u">) {
  return <u {...props} />;
}

function Subtext({ className, ...props }: ComponentPropsWithoutRef<"small">) {
  return (
    <small data-subtext="" className={cn("my-0.5 block text-xs text-sub", className)} {...props} />
  );
}

function InlineCode({ className, ...props }: ComponentPropsWithoutRef<"code">) {
  return (
    <code
      className={cn("rounded bg-soft px-1 py-0.5 font-mono text-[0.8125rem]", className)}
      {...props}
    />
  );
}

// #endregion

// #region Link

interface LinkProps extends ComponentPropsWithoutRef<"a"> {
  href: string;
}

function Link({ href, className, ...props }: LinkProps) {
  return (
    <a
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      className={cn("text-link underline underline-offset-2", className)}
      {...props}
    />
  );
}

// #endregion

// #region MentionChip

const MENTION_CHIP_STYLES = "rounded-md bg-link-soft px-0.5 font-medium text-link";

interface MentionChipProps extends ComponentPropsWithoutRef<"a"> {
  userId: string;
}

function MentionChip({ userId, className, ...props }: MentionChipProps) {
  return (
    <a
      href={`https://matrix.to/#/${userId}`}
      data-mx-mention="user"
      className={cn(MENTION_CHIP_STYLES, className)}
      {...props}
    />
  );
}

// #endregion

// #region Emoji

interface EmojiProps extends ComponentPropsWithoutRef<"span"> {
  char: string;
  jumbo?: boolean;
}

function Emoji({ char, jumbo, className, ...props }: EmojiProps) {
  return (
    <span className={cn(jumbo && "text-2xl leading-7", className)} {...props}>
      {char}
    </span>
  );
}

// #endregion

export { Spoiler, Underline, Subtext, InlineCode, Link, MentionChip, Emoji, MENTION_CHIP_STYLES };
