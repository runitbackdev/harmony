import { expect, test, vi } from "vitest";
import { HarmonyClient, configureHarmony, rpc } from "./harmony";
import type { Transport } from "./transport";

// Fence: this file runs under Node with no DOM and no bundler magic. If core
// ever regains a module-scope DOM, `import.meta`, or host-transport dependency,
// importing ./harmony here fails — catching it long before Metro does.

function fakeTransport(calls: string[]): Transport {
  return {
    request: (name) => {
      calls.push(name);
      return Promise.resolve({ ok: true, value: [] });
    },
    command: (name) => calls.push(name),
    subscribe: () => ({ initial: Promise.resolve({ ok: true, value: [] }), unsubscribe: () => {} }),
    dispose: () => {},
  };
}

test("rpc routes through the configured transport", async () => {
  const calls: string[] = [];
  configureHarmony(() => new HarmonyClient(fakeTransport(calls)));

  await expect(rpc("spaces.get", undefined)).resolves.toEqual({ ok: true, value: [] });
  expect(calls).toEqual(["spaces.get"]);
});

test("the client is constructed once and reused", () => {
  const create = vi.fn(() => new HarmonyClient(fakeTransport([])));
  configureHarmony(create);

  void rpc("spaces.get", undefined);
  void rpc("rooms.get_all", undefined);

  expect(create).toHaveBeenCalledTimes(1);
});

test("calling before configuration throws instead of guessing a host", async () => {
  vi.resetModules();
  const fresh = await import("./harmony");

  expect(() => fresh.rpc("spaces.get", undefined)).toThrow(/not configured/);
});
