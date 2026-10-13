import { beforeEach, describe, expect, it } from "vitest";

import { useOrganizerStore } from "@/modules/organizer/organizer.store";

const store = () => useOrganizerStore.getState();

describe("organizer.store", () => {
  beforeEach(() => useOrganizerStore.setState({ notice: null }));

  it("starts without a notice", () => {
    expect(store().notice).toBeNull();
  });

  it("sets and clears the notice", () => {
    store().setNotice("“Festival de verano” se publicó.");
    expect(store().notice).toBe("“Festival de verano” se publicó.");

    store().clearNotice();
    expect(store().notice).toBeNull();
  });

  it("replaces the previous notice", () => {
    store().setNotice("uno");
    store().setNotice("dos");
    expect(store().notice).toBe("dos");
  });
});
