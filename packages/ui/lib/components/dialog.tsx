import type { ComponentProps } from "react";
import { Dialog as SkeletonDialog } from "@skeletonlabs/skeleton-react";
import { cn } from "../../lib/utils";

// #region Root

type RootProps = ComponentProps<typeof SkeletonDialog>;

function Dialog(props: RootProps) {
  return <SkeletonDialog {...props} />;
}

// #endregion

// #region Trigger

type TriggerProps = ComponentProps<typeof SkeletonDialog.Trigger>;

function Trigger(props: TriggerProps) {
  return <SkeletonDialog.Trigger {...props} />;
}

// #endregion

// #region Backdrop

type BackdropProps = ComponentProps<typeof SkeletonDialog.Backdrop>;

function Backdrop({ className, ...props }: BackdropProps) {
  return (
    <SkeletonDialog.Backdrop
      className={cn("fixed inset-0 bg-black/60 backdrop-blur-xs", className)}
      {...props}
    />
  );
}

// #endregion

// #region Positioner

type PositionerProps = ComponentProps<typeof SkeletonDialog.Positioner>;

function Positioner({ className, ...props }: PositionerProps) {
  return (
    <SkeletonDialog.Positioner
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region Content

type ContentProps = ComponentProps<typeof SkeletonDialog.Content>;

function Content({ className, ...props }: ContentProps) {
  return (
    <SkeletonDialog.Content
      className={cn(
        "relative w-full max-w-md rounded-xl bg-surface-100-900 border border-surface-300-700 p-6 shadow-xl",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region Title

type TitleProps = ComponentProps<typeof SkeletonDialog.Title>;

function Title({ className, ...props }: TitleProps) {
  return (
    <SkeletonDialog.Title
      className={cn("text-lg font-semibold text-surface-950-50", className)}
      {...props}
    />
  );
}

// #endregion

// #region Description

type DescriptionProps = ComponentProps<typeof SkeletonDialog.Description>;

function Description({ className, ...props }: DescriptionProps) {
  return (
    <SkeletonDialog.Description
      className={cn("mt-1 text-sm text-surface-600-400", className)}
      {...props}
    />
  );
}

// #endregion

// #region CloseTrigger

type CloseTriggerProps = ComponentProps<typeof SkeletonDialog.CloseTrigger>;

function CloseTrigger({ className, ...props }: CloseTriggerProps) {
  return (
    <SkeletonDialog.CloseTrigger
      aria-label="Close"
      className={cn(
        "absolute top-4 right-4 text-surface-500 hover:text-surface-950-50 cursor-pointer transition-colors",
        className,
      )}
      {...props}
    />
  );
}

// #endregion

// #region Export

Dialog.Trigger = Trigger;
Dialog.Backdrop = Backdrop;
Dialog.Positioner = Positioner;
Dialog.Content = Content;
Dialog.Title = Title;
Dialog.Description = Description;
Dialog.CloseTrigger = CloseTrigger;

export { Dialog };

// #endregion
