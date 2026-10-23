import { describe, it, expect } from "vitest";
import { sequencePairs, accessPorts } from "../src/lib/diagram-types";
import { graph } from "../src/lib/network";
describe("physical optical connectivity", () => {
  it("reverses an atomic batch without enforcing colors", () => {
    expect(sequencePairs(["a1", "a2"], ["b1", "b2"], true)).toEqual([
      { a: "a1", b: "b2" },
      { a: "a2", b: "b1" },
    ]);
    expect(() => sequencePairs(["a"], ["a"])).toThrow();
    expect(() => sequencePairs(["a", "b"], ["c"])).toThrow();
    expect(() => sequencePairs(["a", "b"], ["c", "a"])).toThrow();
  });
  it("routes a single fiber through multiple ordered midspan faces without bridging cuts", () => {
    const node = (
      id: string,
      kind: string,
      attachmentId: string | null = null,
      routePosition: number | null = null,
      localSide: string | null = null,
    ) => ({
      id,
      kind,
      assetId: "cable",
      fiberId: "fiber",
      label: id,
      attachmentId,
      routePosition,
      localSide,
    });
    const nodes = [
      node("endB", "FIBER_B"),
      node("m2o", "FIBER_A", "m2", 0.8, "OUT"),
      node("endA", "FIBER_A"),
      node("m1i", "FIBER_B", "m1", 0.2, "IN"),
      node("m2i", "FIBER_B", "m2", 0.8, "IN"),
      node("m1o", "FIBER_A", "m1", 0.2, "OUT"),
    ];
    const edges = graph([], nodes, [
      {
        kind: "PASS_THROUGH",
        lossDb: 0,
        terminals: [{ terminalId: "m1i" }, { terminalId: "m1o" }],
      },
    ]);
    expect(edges.map((e) => [e.a, e.b])).toEqual([
      ["m1i", "m1o"],
      ["endA", "m1i"],
      ["m1o", "m2i"],
      ["m2o", "endB"],
    ]);
    expect(edges.some((e) => e.a === "m2i" && e.b === "m2o")).toBe(false);
  });
  it("reuses cable end IDs and creates stable local face IDs for the same fiber", () => {
    const asset = {
      id: "a",
      code: "a",
      name: "a",
      kind: "BACKBONE",
      status: "INSTALLED",
      fibers: [
        {
          id: "f",
          number: 1,
          tube: 1,
          color: "Azul",
          tubeColor: "Azul",
          status: "AVAILABLE" as const,
        },
      ],
      terminals: [{ id: "end", fiberId: "f", kind: "FIBER_A", label: "1/A" }],
    };
    const access = {
      id: "x",
      cableId: "a",
      end: "A" as const,
      fraction: 0,
      fiberStates: {},
    };
    expect(accessPorts(asset, access)[0].id).toBe("end");
    const ps = accessPorts(asset, { ...access, end: "MID", fraction: 0.4 });
    expect(ps.map((p) => p.id)).toEqual(["x:f:IN", "x:f:OUT"]);
    expect(ps.every((p) => p.fiberId === "f")).toBe(true);
  });
});
