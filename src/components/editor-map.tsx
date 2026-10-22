"use client";
import { useEffect, useRef, useState } from "react";
import * as ml from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { EditorAsset } from "@/lib/editor-types";
import type { Coordinate, MapGeometry } from "@/lib/geo";
import { vertices, moveVertex, cameraCoordinates } from "@/lib/vertices";
import { kinds } from "@/lib/types";
type Props = {
  assets: EditorAsset[];
  preview: { id: number; geometry: MapGeometry; color: string; name: string }[];
  mode: string;
  draft: MapGeometry | null;
  drawing: Coordinate[];
  selectedId: string | null;
  styleUrl: string;
  focus: MapGeometry | null;
  highlighted: string[];
  onSelect: (a: EditorAsset) => void;
  onClick: (at: Coordinate) => void;
  onFinish: () => void;
  onGeometry: (g: MapGeometry) => void;
  onVertex: (path: number[]) => void;
  onCoordinate: (at: Coordinate) => void;
};
const empty: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};
export default function EditorMap(props: Props) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<ml.Map | null>(null),
    state = useRef(props),
    [error, setError] = useState("");
  state.current = props;
  const drag = useRef<{ path: number[]; geometry: MapGeometry } | null>(null),
    suppress = useRef(false);
  useEffect(() => {
    if (!host.current) return;
    ml.setWorkerUrl("/vendor/maplibre/maplibre-gl-worker.mjs");
    const m = new ml.Map({
      container: host.current,
      style: props.styleUrl,
      center: [-46.6333, -23.5505],
      zoom: 11,
    });
    map.current = m;
    m.addControl(new ml.NavigationControl(), "bottom-right");
    m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
    m.addControl(
      new ml.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
      }),
      "bottom-right",
    );
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(host.current);
    let rendered: unknown[] = [];
    const update = () => {
      rendered = [];
      for (const kind of Object.keys(kinds)) {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const c = canvas.getContext("2d");
        if (!c) continue;
        c.strokeStyle = "#fff";
        c.fillStyle = "#fff";
        c.lineWidth = 2.4;
        c.lineCap = "round";
        c.lineJoin = "round";
        c.beginPath();
        if (kind === "SPLITTER") {
          c.moveTo(16, 6);
          c.lineTo(16, 15);
          for (const x of [7, 16, 25]) {
            c.moveTo(16, 15);
            c.lineTo(x, 24);
          }
        } else if (kind === "CUSTOMER" || kind === "POP") {
          c.moveTo(5, 15);
          c.lineTo(16, 6);
          c.lineTo(27, 15);
          c.moveTo(9, 13);
          c.lineTo(9, 25);
          c.lineTo(23, 25);
          c.lineTo(23, 13);
          if (kind === "POP") {
            c.moveTo(13, 25);
            c.lineTo(13, 18);
            c.lineTo(19, 18);
            c.lineTo(19, 25);
          }
        } else if (kind === "POLE") {
          c.moveTo(16, 5);
          c.lineTo(16, 27);
          c.moveTo(7, 10);
          c.lineTo(25, 10);
          c.moveTo(10, 6);
          c.lineTo(22, 6);
        } else if (kind === "DIO") {
          c.rect(5, 9, 22, 14);
          for (const x of [10, 16, 22]) {
            c.moveTo(x, 13);
            c.lineTo(x, 19);
          }
        } else if (kind === "OLT") {
          c.rect(7, 6, 18, 20);
          for (const y of [11, 16, 21]) {
            c.moveTo(11, y);
            c.lineTo(21, y);
          }
        } else if (kind === "CTO") {
          c.rect(7, 6, 18, 20);
          for (const x of [12, 20])
            for (const y of [12, 20]) {
              c.moveTo(x - 1, y);
              c.lineTo(x + 1, y);
            }
        } else if (kind === "CLOSURE") {
          c.ellipse(16, 16, 11, 7, 0, 0, Math.PI * 2);
          c.moveTo(16, 9);
          c.lineTo(16, 23);
        } else if (kind === "RESERVE") {
          c.arc(16, 16, 9, 0, Math.PI * 1.7);
          c.moveTo(22, 8);
          c.lineTo(26, 12);
          c.lineTo(20, 13);
        } else {
          c.moveTo(16, 7);
          c.lineTo(16, 25);
          c.moveTo(7, 16);
          c.lineTo(25, 16);
        }
        c.stroke();
        if (!m.hasImage(`equipment-${kind}`))
          m.addImage(`equipment-${kind}`, c.getImageData(0, 0, 32, 32), {
            pixelRatio: 2,
          });
      }
      for (const id of ["network", "draft", "vertices"])
        if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });
      m.addLayer({
        id: "areas",
        type: "fill",
        source: "network",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.17 },
      });
      m.addLayer({
        id: "lines",
        type: "line",
        source: "network",
        filter: ["!=", ["geometry-type"], "Point"],
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["get", "selected"], 7, 4],
        },
      });
      m.addLayer({
        id: "points",
        type: "circle",
        source: "network",
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": [
            "match",
            ["get", "kind"],
            "POP",
            11,
            "OLT",
            10,
            "CTO",
            8,
            "CLOSURE",
            9,
            "POLE",
            5,
            7,
          ],
          "circle-stroke-color": [
            "case",
            ["get", "selected"],
            "#ffb733",
            "#fff",
          ],
          "circle-stroke-width": 3,
        },
      });
      m.addLayer({
        id: "equipment-icons",
        type: "symbol",
        source: "network",
        filter: ["==", ["geometry-type"], "Point"],
        layout: {
          "icon-image": ["concat", "equipment-", ["get", "kind"]],
          "icon-allow-overlap": true,
        },
      });
      m.addLayer({
        id: "labels",
        type: "symbol",
        source: "network",
        layout: {
          "text-field": ["get", "label"],
          "text-size": 11,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#24364c",
          "text-halo-color": "#fff",
          "text-halo-width": 2,
        },
      });
      m.addLayer({
        id: "draft-area",
        type: "fill",
        source: "draft",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#f0a329", "fill-opacity": 0.18 },
      });
      m.addLayer({
        id: "draft-line",
        type: "line",
        source: "draft",
        paint: {
          "line-color": "#f0a329",
          "line-width": 4,
          "line-dasharray": [2, 1],
        },
      });
      m.addLayer({
        id: "draft-point",
        type: "circle",
        source: "draft",
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-color": "#f0a329", "circle-radius": 8 },
      });
      m.addLayer({
        id: "vertex",
        type: "circle",
        source: "vertices",
        paint: {
          "circle-color": "#fff",
          "circle-stroke-color": "#df8c16",
          "circle-stroke-width": 2,
          "circle-radius": 5,
        },
      });
      render();
    };
    function render() {
      const s = state.current;
      const deps = [
        s.assets,
        s.preview,
        s.selectedId,
        s.highlighted,
        s.draft,
        s.drawing,
        s.mode,
      ];
      if (
        drag.current ||
        !m.getSource("network") ||
        deps.every((v, i) => v === rendered[i])
      )
        return;
      rendered = deps;
      const features: GeoJSON.Feature[] = s.assets.map((a) => ({
        type: "Feature",
        geometry: a.geometry,
        properties: {
          id: a.id,
          color: s.highlighted.includes(a.id) ? "#ffbb33" : a.color,
          selected: a.id === s.selectedId,
          kind: a.kind,
          label: a.geometry.type.includes("Point")
            ? `${a.kind} · ${a.name}`
            : a.name,
        },
      }));
      for (const a of s.preview)
        features.push({
          type: "Feature",
          geometry: a.geometry,
          properties: {
            id: `preview-${a.id}`,
            color: a.color,
            selected: false,
            label: a.name,
            kind: "IMPORTED",
          },
        });
      (m.getSource("network") as ml.GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      });
      const geom =
        s.draft ??
        (s.drawing.length > 1
          ? { type: "LineString" as const, coordinates: s.drawing }
          : s.drawing.length
            ? { type: "Point" as const, coordinates: s.drawing[0] }
            : null);
      (m.getSource("draft") as ml.GeoJSONSource | undefined)?.setData(
        geom ? { type: "Feature", properties: {}, geometry: geom } : empty,
      );
      (m.getSource("vertices") as ml.GeoJSONSource | undefined)?.setData(
        s.draft && s.mode === "edit"
          ? {
              type: "FeatureCollection",
              features: vertices(s.draft)
                .filter((v) => !v.closing)
                .map((v) => ({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: v.coordinate },
                  properties: { path: JSON.stringify(v.path) },
                })),
            }
          : empty,
      );
    }
    m.on("style.load", update);
    m.on("error", () =>
      setError(
        "Parte da cartografia não carregou. Tente outro estilo ou verifique sua conexão.",
      ),
    );
    m.on("idle", () => {
      if (m.areTilesLoaded()) setError("");
    });
    m.on("mousemove", (e) => {
      state.current.onCoordinate([e.lngLat.lng, e.lngLat.lat]);
      if (drag.current) {
        drag.current.geometry = moveVertex(
          drag.current.geometry,
          drag.current.path,
          [e.lngLat.lng, e.lngLat.lat],
        );
        (m.getSource("draft") as ml.GeoJSONSource)?.setData({
          type: "Feature",
          properties: {},
          geometry: drag.current.geometry,
        });
        (m.getSource("vertices") as ml.GeoJSONSource)?.setData({
          type: "FeatureCollection",
          features: vertices(drag.current.geometry)
            .filter((v) => !v.closing)
            .map((v) => ({
              type: "Feature",
              properties: { path: JSON.stringify(v.path) },
              geometry: { type: "Point", coordinates: v.coordinate },
            })),
        });
      }
    });
    m.on("mousedown", (e) => {
      if (
        state.current.mode !== "edit" ||
        !state.current.draft ||
        !m.getLayer("vertex")
      )
        return;
      const f = m.queryRenderedFeatures(e.point, { layers: ["vertex"] })[0];
      if (f) {
        e.preventDefault();
        const path = JSON.parse(f.properties!.path) as number[];
        state.current.onVertex(path);
        drag.current = { path, geometry: structuredClone(state.current.draft) };
        m.dragPan.disable();
      }
    });
    const finishDrag = () => {
      if (drag.current) {
        state.current.onGeometry(drag.current.geometry);
        drag.current = null;
        suppress.current = true;
        m.dragPan.enable();
      }
    };
    m.on("mouseup", finishDrag);
    window.addEventListener("mouseup", finishDrag);
    m.on("touchstart", (e) => {
      if (
        state.current.mode !== "edit" ||
        !state.current.draft ||
        !m.getLayer("vertex") ||
        e.points.length !== 1
      )
        return;
      const f = m.queryRenderedFeatures(e.points[0], { layers: ["vertex"] })[0];
      if (!f) return;
      e.preventDefault();
      const path = JSON.parse(f.properties!.path) as number[];
      state.current.onVertex(path);
      drag.current = { path, geometry: structuredClone(state.current.draft) };
      m.dragPan.disable();
    });
    m.on("touchmove", (e) => {
      if (!drag.current || e.lngLats.length !== 1) return;
      e.preventDefault();
      const at = e.lngLats[0];
      drag.current.geometry = moveVertex(
        drag.current.geometry,
        drag.current.path,
        [at.lng, at.lat],
      );
      (m.getSource("draft") as ml.GeoJSONSource)?.setData({
        type: "Feature",
        properties: {},
        geometry: drag.current.geometry,
      });
      (m.getSource("vertices") as ml.GeoJSONSource)?.setData({
        type: "FeatureCollection",
        features: vertices(drag.current.geometry)
          .filter((v) => !v.closing)
          .map((v) => ({
            type: "Feature",
            properties: { path: JSON.stringify(v.path) },
            geometry: { type: "Point", coordinates: v.coordinate },
          })),
      });
    });
    m.on("touchend", finishDrag);
    window.addEventListener("touchcancel", finishDrag);
    m.on("click", (e) => {
      if (suppress.current) {
        suppress.current = false;
        return;
      }
      const s = state.current;
      if (s.mode === "select") {
        if (!m.getLayer("points")) return;
        const f = m.queryRenderedFeatures(e.point, {
            layers: ["points", "lines", "areas"],
          })[0],
          a = s.assets.find((a) => a.id === f?.properties?.id);
        if (a) s.onSelect(a);
      } else if (s.mode !== "edit" && e.originalEvent.detail < 2)
        s.onClick([e.lngLat.lng, e.lngLat.lat]);
    });
    m.on("dblclick", (e) => {
      if (["line", "polygon", "measure"].includes(state.current.mode)) {
        e.preventDefault();
        state.current.onFinish();
      }
    });
    m.on("render", render);
    return () => {
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("touchcancel", finishDrag);
      observer.disconnect();
      m.remove();
      map.current = null;
    };
    // Map lifetime is independent of editor drafts; event handlers read current props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    map.current?.setStyle(props.styleUrl);
  }, [props.styleUrl]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    m.getCanvas().style.cursor = props.mode === "select" ? "" : "crosshair";
    if (props.mode === "select") m.doubleClickZoom.enable();
    else m.doubleClickZoom.disable();
    m.triggerRepaint();
  }, [
    props.assets,
    props.preview,
    props.mode,
    props.draft,
    props.drawing,
    props.selectedId,
    props.highlighted,
  ]);
  useEffect(() => {
    if (!props.focus || !map.current) return;
    const coords = cameraCoordinates(props.focus);
    if (!coords.length) return;
    const bounds = new ml.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => bounds.extend(c));
    map.current.fitBounds(bounds, { padding: 65, maxZoom: 17, duration: 700 });
  }, [props.focus]);
  return (
    <div className="editor-map">
      <div ref={host} className="editor-canvas" />
      {error && (
        <div className="editor-map-error" role="status">
          {error}
        </div>
      )}
    </div>
  );
}
