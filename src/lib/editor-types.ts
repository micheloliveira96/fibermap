import type { MapGeometry } from "./geo";
import type { Asset } from "./types";
export type EditorAsset = Omit<Asset, "geometry"> & {
  geometry: MapGeometry;
  parentId: string | null;
  color: string;
  projectId: string | null;
  layerId: string | null;
  geographicLengthM: number;
  physicalLengthM: number | null;
  reserveM: number;
  manufacturer: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  notes: string | null;
  installedAt: string | null;
  metadata: { insertionLossDb?: number; colorPattern?: string[] };
  segments: {
    id: string;
    position: number;
    geometry: MapGeometry;
    lengthM: number;
  }[];
};
export type Layer = {
  id: string;
  name: string;
  projectId: string | null;
  color: string;
  visible: boolean;
  version: number;
};
export type MapData = {
  role: string;
  permissions?: string[];
  projects: { id: string; name: string; colorPattern: string[] }[];
  layers: Layer[];
  connections: {
    id: string;
    kind: string;
    locationId: string | null;
    tray: string | null;
    terminals: { terminalId: string }[];
  }[];
  imports: {
    id: string;
    filename: string;
    projectId: string;
    createdAt: string;
  }[];
  audits: { id: string; entityId: string; action: string; createdAt: string }[];
};
