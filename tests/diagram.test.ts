import { describe, it, expect } from "vitest";
import {
  sequencePairs,
  accessPorts,
  endpointColor,
  pairError,
  neutralPortColor,
  type DiagramEndpoint,
} from "../src/lib/diagram-types";
import { graph } from "../src/lib/network";
describe("physical optical connectivity", () => {
  const endpoint = (
    id: string,
    color?: string,
    kind = "FIBER_A",
  ): DiagramEndpoint => ({
    port: { id, fiberId: color ? id : null, label: id, kind },
    asset: {
      id,
      code: id,
      name: id,
      kind: color ? "BACKBONE" : "SPLITTER",
      status: "INSTALLED",
      terminals: [],
      fibers: color
        ? [
            {
              id,
              color,
              number: 1,
              tube: 1,
              tubeColor: "Azul",
              status: "AVAILABLE",
            },
          ]
        : [],
    },
  });
  it("derives uniform/bicolor endpoints from fibers and reflects fiber edits without changing links", () => {
    const a = endpoint("a", "Azul"),
      b = endpoint("b", "Azul");
    expect(endpointColor(a)).toBe(endpointColor(b));
    b.asset.fibers[0].color = "Amarelo";
    expect(endpointColor(a)).not.toBe(endpointColor(b));
    expect(b.port.id).toBe("b");
    b.asset.fibers[0].color = "#123456";
    expect(endpointColor(b)).toBe("#123456");
  });
  it("uses neutral port identification unless explicitly configured", () => {
    const port = endpoint("split-in", undefined, "SPLITTER_IN");
    expect(endpointColor(port)).toBe(neutralPortColor);
    port.port.identificationColor = "#eeaabb";
    expect(endpointColor(port)).toBe("#eeaabb");
  });
  it("maps multiple splitters and blocks occupancy, duplicate selection and incompatible ports", () => {
    const a = endpoint("a", "Azul"),
      input = endpoint("in", undefined, "SPLITTER_IN"),
      output = endpoint("out", undefined, "SPLITTER_OUT");
    expect(pairError(a, input, new Set())).toBe("");
    expect(pairError(output, a, new Set())).toBe("");
    expect(pairError(input, output, new Set())).toBe("");
    expect(pairError(a, input, new Set(["in"]))).toContain("ocupada");
    expect(
      pairError(
        input,
        endpoint("other-in", undefined, "SPLITTER_IN"),
        new Set(),
      ),
    ).toContain("compatível");
    expect(
      sequencePairs(["f1", "f2", "f3"], ["spl1:in", "spl2:in", "spl3:in"]),
    ).toHaveLength(3);
    expect(() => sequencePairs(["f1", "f2"], ["spl1:in", "spl1:in"])).toThrow();
  });
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
