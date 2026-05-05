import type { ComponentProps } from "react";
import { Toast as SkeletonToast } from "@skeletonlabs/skeleton-react";
import { cn } from "../../lib/utils";

// #region Group

type GroupProps = ComponentProps<typeof SkeletonToast.Group>;

function Group({ className, ...props }: GroupProps) {
  return (
    <SkeletonToast.Group
      className={cn("fixed bottom-4 right-4 z-60 flex flex-col gap-2 outline-none", className)}
      {...props}
    />
  );
}

// #endregion

// #region Root

type RootProps = ComponentProps<typeof SkeletonToast>;

function Root({ className, ...props }: RootProps) {
  return (
    <SkeletonToast
      className={cn(
        "relative bg-surface-100-900 border border-surface-300-700 rounded-md shadow-lg",
        "min-w-70 max-w-105 p-4 pr-10",
        "data-[type=success]:border-l-4 data-[type=success]:border-l-success-500",
        "data-[type=error]:border-l-4 data-[type=error]:border-l-error-500",
        "data-[type=info]:border-l-4 data-[type=info]:border-l-primary-500",
        "data-[type=loading]:border-l-4 data-[type=loading]:border-l-secondary-500",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region Message

type MessageProps = ComponentProps<typeof SkeletonToast.Message>;

function Message(props: MessageProps) {
  return <SkeletonToast.Message {...props} />;
}

// #endregion

// #region Title

type TitleProps = ComponentProps<typeof SkeletonToast.Title>;

function Title({ className, ...props }: TitleProps) {
  return (
    <SkeletonToast.Title
      className={cn("text-sm font-medium text-surface-950-50", className)}
      {...props}
    />
  );
}

// #endregion

// #region Description

type DescriptionProps = ComponentProps<typeof SkeletonToast.Description>;

function Description({ className, ...props }: DescriptionProps) {
  return (
    <SkeletonToast.Description
      className={cn("mt-1 text-sm text-surface-600-400", className)}
      {...props}
    />
  );
}

// #endregion

// #region CloseTrigger

type CloseTriggerProps = ComponentProps<typeof SkeletonToast.CloseTrigger>;

function CloseTrigger({ className, ...props }: CloseTriggerProps) {
  return (
    <SkeletonToast.CloseTrigger
      aria-label="Close"
      className={cn(
        "absolute top-2 right-2 size-6 inline-flex items-center justify-center",
        "text-surface-500 hover:text-surface-950-50 cursor-pointer transition-colors rounded",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region ActionTrigger

type ActionTriggerProps = ComponentProps<typeof SkeletonToast.ActionTrigger>;

function ActionTrigger({ className, ...props }: ActionTriggerProps) {
  return (
    <SkeletonToast.ActionTrigger
      className={cn(
        "mt-2 text-sm font-medium text-primary-500 hover:text-primary-600 cursor-pointer transition-colors",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region Export

const Toast = Object.assign(Root, {
  Group,
  Message,
  Title,
  Description,
  CloseTrigger,
  ActionTrigger,
});

export { Toast };

// #endregion
