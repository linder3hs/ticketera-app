import { beforeEach, describe, expect, it } from "vitest";

import { usePanelStore } from "@/modules/panel/panel.store";

const store = () => usePanelStore.getState();

describe("panel.store", () => {
  beforeEach(() => usePanelStore.setState({ collapsed: false }));

  it("starts expanded", () => {
    expect(store().collapsed).toBe(false);
  });

  it("toggles between collapsed and expanded", () => {
    store().toggleCollapsed();
    expect(store().collapsed).toBe(true);
    store().toggleCollapsed();
    expect(store().collapsed).toBe(false);
  });
});
