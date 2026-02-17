import {
  Hash,
  MessageCircle,
  Bell,
  Settings,
  MessageSquare,
  Home,
  Code,
  Plus,
} from "lucide-react";
import { Sidebar, Rail } from "@harmony/ui";

function App() {
  return (
    <div className="h-screen flex">
      <Rail>
        <Rail.Item active>
          <Home />
        </Rail.Item>
        <Rail.Item unread mentionCount={3}>
          <MessageSquare />
        </Rail.Item>
        <Rail.Item>
          <Code />
        </Rail.Item>
        <Rail.Separator />
        <Rail.Item>
          <Plus />
        </Rail.Item>
      </Rail>

      <Sidebar>
        <Sidebar.Header>Acme Workspace</Sidebar.Header>

        <Sidebar.List className="flex-1">
          <Sidebar.SectionLabel>Channels</Sidebar.SectionLabel>
          <Sidebar.Item icon={<Hash />} active>
            general
          </Sidebar.Item>
          <Sidebar.Item icon={<Hash />} badge={<Sidebar.Badge count={12} />}>
            engineering
          </Sidebar.Item>
          <Sidebar.Item
            icon={<Hash />}
            unread
            badge={<Sidebar.Badge count={3} mention />}
          >
            design-systems
          </Sidebar.Item>
          <Sidebar.Item icon={<Hash />}>marketing</Sidebar.Item>
          <Sidebar.Item icon={<Hash />}>product</Sidebar.Item>
          <Sidebar.SectionLabel>Direct Messages</Sidebar.SectionLabel>
          <Sidebar.Item icon={<MessageCircle />} unread>
            Dylan Hackworth
          </Sidebar.Item>
          <Sidebar.Item
            icon={<MessageCircle />}
            badge={<Sidebar.Badge count={1} mention />}
          >
            Michael Lari
          </Sidebar.Item>
        </Sidebar.List>

        <Sidebar.List className="border-t border-surface-300-700 pt-2">
          <Sidebar.Item icon={<Bell />}>Notifications</Sidebar.Item>
          <Sidebar.Item icon={<Settings />}>Settings</Sidebar.Item>
        </Sidebar.List>
      </Sidebar>
    </div>
  );
}

export default App;
