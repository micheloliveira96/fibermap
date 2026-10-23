"use client";
import { memo, useLayoutEffect, useRef, useState } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
export type OpticalEdgeData = {
  sourceColor: string;
  targetColor: string;
  sourceLabel: string;
  targetLabel: string;
  kind: string;
  title: string;
  onSelect: () => void;
};
export type ColoredEdge = Edge<OpticalEdgeData, "opticalLink">;
export const OpticalEdge = memo(function OpticalEdge(
  props: EdgeProps<ColoredEdge>,
) {
  const { id, data, selected } = props;
  const [path, labelX, labelY] = getSmoothStepPath(props);
  const ref = useRef<SVGPathElement>(null);
  const [metric, setMetric] = useState({ path: "", length: 0, x: 0, y: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const length = element.getTotalLength();
    const middle = element.getPointAtLength(length / 2);
    setMetric({ path, length, x: middle.x, y: middle.y });
  }, [path]);
  if (!data) return null;
  const half = metric.path === path ? metric.length / 2 : 0;
  const x = half ? metric.x : labelX,
    y = half ? metric.y : labelY;
  return (
    <g
      className="od-colored-edge"
      data-source-color={data.sourceColor}
      data-target-color={data.targetColor}
    >
      <title>{data.title}</title>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={24}
        style={{
          stroke: selected ? "var(--od-text)" : "var(--od-muted)",
          strokeWidth: selected ? 8 : 5,
          opacity: selected ? 0.85 : 0.65,
        }}
      />
      <path
        ref={ref}
        d={path}
        fill="none"
        stroke={data.sourceColor}
        strokeWidth={selected ? 4 : 2.5}
      />
      {data.sourceColor !== data.targetColor && half > 0 && (
        <path
          d={path}
          fill="none"
          stroke={data.targetColor}
          strokeWidth={selected ? 4 : 2.5}
          strokeDasharray={`${half} ${metric.length}`}
          strokeDashoffset={-half}
          data-color-half="destination"
        />
      )}
      {data.kind === "SPLICE" && (
        <circle
          cx={x}
          cy={y}
          r={selected ? 5 : 4}
          fill="var(--od-panel)"
          stroke="var(--od-text)"
          strokeWidth={1.5}
        />
      )}
      <EdgeLabelRenderer>
        <button
          className="od-edge-label nodrag nopan"
          style={{
            transform: `translate(-50%, -100%) translate(${x}px, ${y - 9}px)`,
          }}
          title={data.title}
          onClick={data.onSelect}
        >
          <b>
            {data.kind === "SPLICE"
              ? "Fusão"
              : data.kind === "PASS_THROUGH"
                ? "Contínua"
                : data.kind === "PATCH"
                  ? "Conector"
                  : "Documental"}
          </b>
          <span>
            {data.sourceLabel} → {data.targetLabel}
          </span>
        </button>
      </EdgeLabelRenderer>
    </g>
  );
});
