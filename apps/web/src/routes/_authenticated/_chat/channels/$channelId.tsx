import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Sidebar } from "@harmony/ui";
import { Hash, Mic, Headphones, Settings, Volume2 } from "lucide-react";

const mockTextChannels = [
  { id: "1", name: "general", unread: true },
  { id: "2", name: "introductions" },
  { id: "3", name: "off-topic", mentionCount: 3 },
];

const mockVoiceChannels = [
  { id: "4", name: "Lounge" },
  { id: "5", name: "Music" },
];

export const Route = createFileRoute(
  "/_authenticated/_chat/channels/$channelId",
)({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <Sidebar>
        <Sidebar.Header data-sidebar="header">Harmony Dev</Sidebar.Header>

        <div className="flex-1 overflow-y-auto">
          <Sidebar.SectionLabel data-sidebar="section-label">
            Text Channels
          </Sidebar.SectionLabel>
          <Sidebar.List data-sidebar="channel-list" data-channel-type="text">
            {mockTextChannels.map((channel) => (
              <Sidebar.Item
                key={channel.id}
                data-sidebar="channel"
                data-channel={channel.id}
                active={channel.id === "1"}
                unread={channel.unread}
                icon={<Hash size={16} />}
                badge={
                  channel.mentionCount ? (
                    <Sidebar.Badge count={channel.mentionCount} mention />
                  ) : undefined
                }
              >
                {channel.name}
              </Sidebar.Item>
            ))}
          </Sidebar.List>

          <Sidebar.SectionLabel data-sidebar="section-label">
            Voice Channels
          </Sidebar.SectionLabel>
          <Sidebar.List data-sidebar="channel-list" data-channel-type="voice">
            {mockVoiceChannels.map((channel) => (
              <Sidebar.Item
                key={channel.id}
                data-sidebar="channel"
                data-channel={channel.id}
                icon={<Volume2 size={16} />}
              >
                {channel.name}
              </Sidebar.Item>
            ))}
          </Sidebar.List>
        </div>

        <div
          data-sidebar="user-panel"
          className="flex items-center gap-2 p-2 border-t border-surface-300-700 bg-surface-100-900"
        >
          <div className="size-8 rounded-full bg-primary-500 flex items-center justify-center text-on-primary text-xs font-semibold">
            U
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-surface-950-50 truncate">
              User
            </div>
            <div className="text-xs text-surface-500 truncate">Online</div>
          </div>
          <button
            data-sidebar="mic-btn"
            className="p-1 text-surface-500 hover:text-surface-950-50 cursor-pointer"
          >
            <Mic size={16} />
          </button>
          <button
            data-sidebar="deafen-btn"
            className="p-1 text-surface-500 hover:text-surface-950-50 cursor-pointer"
          >
            <Headphones size={16} />
          </button>
          <button
            data-sidebar="settings-btn"
            className="p-1 text-surface-500 hover:text-surface-950-50 cursor-pointer"
          >
            <Settings size={16} />
          </button>
        </div>
      </Sidebar>

      <Outlet />
    </>
  );
}
