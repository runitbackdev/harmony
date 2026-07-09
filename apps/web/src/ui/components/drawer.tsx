import { Drawer as VaulDrawer } from "vaul";
import type { ComponentProps } from "react";
import { cn } from "../utils";

// #region Root

type RootProps = ComponentProps<typeof VaulDrawer.Root>;

function Drawer(props: RootProps) {
  return <VaulDrawer.Root {...props} />;
}

// #endregion

// #region Trigger

type TriggerProps = ComponentProps<typeof VaulDrawer.Trigger>;

function Trigger(props: TriggerProps) {
  return <VaulDrawer.Trigger {...props} />;
}

// #endregion

// #region Portal

type PortalProps = ComponentProps<typeof VaulDrawer.Portal>;

function Portal(props: PortalProps) {
  return <VaulDrawer.Portal {...props} />;
}

// #endregion

// #region Overlay

type OverlayProps = ComponentProps<typeof VaulDrawer.Overlay>;

function Overlay({ className, ...props }: OverlayProps) {
  return (
    <VaulDrawer.Overlay
      className={cn("fixed inset-0 z-50 bg-black/60 backdrop-blur-xs", className)}
      {...props}
    />
  );
}

// #endregion

// #region Content

type ContentProps = ComponentProps<typeof VaulDrawer.Content>;

function Content({ className, children, ...props }: ContentProps) {
  return (
    <VaulDrawer.Content
      className={cn(
        "fixed bottom-0 z-50 flex flex-col bg-surface border-line focus:outline-none h-full",
        className,
      )}
      {...props}
    >
      {children}
    </VaulDrawer.Content>
  );
}

// #endregion

// #region Title

type TitleProps = ComponentProps<typeof VaulDrawer.Title>;

function Title({ className, ...props }: TitleProps) {
  return (
    <VaulDrawer.Title className={cn("text-subhead font-semibold text-ink", className)} {...props} />
  );
}

// #endregion

// #region Description

type DescriptionProps = ComponentProps<typeof VaulDrawer.Description>;

function Description({ className, ...props }: DescriptionProps) {
  return <VaulDrawer.Description className={cn("text-small text-sub", className)} {...props} />;
}

// #endregion

// #region Export

Drawer.Trigger = Trigger;
Drawer.Portal = Portal;
Drawer.Overlay = Overlay;
Drawer.Content = Content;
Drawer.Title = Title;
Drawer.Description = Description;

export { Drawer };

// #endregion
