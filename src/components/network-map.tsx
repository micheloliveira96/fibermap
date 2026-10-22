'use client';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Asset, Geometry } from '@/lib/types';
export default function NetworkMap({ assets, mode, onDraw, onSelect, highlighted, center }: { assets: Asset[]; mode: string; onDraw: (geometry: Geometry) => void; onSelect: (asset: Asset) => void; highlighted: string[]; center: [number, number] | null }) {
  const host = useRef<HTMLDivElement>(null), map = useRef<maplibregl.Map | null>(null);
  const state = useRef({ mode, onDraw, onSelect, assets }); state.current = { mode, onDraw, onSelect, assets };
  const points = useRef<[number, number][]>([]), [error, setError] = useState('');
  const style = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  useEffect(() => {
    if (!host.current || !style) return;
    const m = new maplibregl.Map({ container: host.current, style, center: [-46.6333, -23.5505], zoom: 12 }); map.current = m;
    m.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }));
    m.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right');
    m.on('error', () => setError('Não foi possível carregar parte da cartografia. Confira o provedor de mapas.'));
    m.on('load', () => {
      m.addSource('network', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'cables', type: 'line', source: 'network', filter: ['==', '$type', 'LineString'], paint: { 'line-color': ['case', ['get', 'highlight'], '#f5ae35', '#18a99b'], 'line-width': 4 } });
      m.addLayer({ id: 'equipment', type: 'circle', source: 'network', filter: ['==', '$type', 'Point'], paint: { 'circle-color': ['case', ['get', 'highlight'], '#f5ae35', '#536bea'], 'circle-radius': 7, 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      m.addLayer({ id: 'draft-line', type: 'line', source: 'draft', paint: { 'line-color': '#f5ae35', 'line-width': 3, 'line-dasharray': [2, 2] } });
      update();
    });
    function update() { const src = m.getSource('network') as maplibregl.GeoJSONSource | undefined; src?.setData({ type: 'FeatureCollection', features: state.current.assets.map(a => ({ type: 'Feature', properties: { id: a.id }, geometry: a.geometry })) }); }
    m.on('click', e => {
      const s = state.current;
      if (s.mode === 'point') { s.onDraw({ type: 'Point', coordinates: [e.lngLat.lng, e.lngLat.lat] }); return; }
      if (s.mode === 'line') {
        points.current.push([e.lngLat.lng, e.lngLat.lat]);
        if (points.current.length > 1) (m.getSource('draft') as maplibregl.GeoJSONSource)?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: points.current } });
        return;
      }
      const feature = m.queryRenderedFeatures(e.point, { layers: ['equipment', 'cables'] })[0];
      const asset = s.assets.find(a => a.id === feature?.properties?.id); if (asset) s.onSelect(asset);
    });
    m.on('dblclick', e => { if (state.current.mode === 'line') { e.preventDefault(); const coords = points.current.filter((p, i, arr) => !i || p[0] !== arr[i-1][0] || p[1] !== arr[i-1][1]); if (coords.length >= 2) state.current.onDraw({ type: 'LineString', coordinates: coords }); points.current = []; (m.getSource('draft') as maplibregl.GeoJSONSource)?.setData({ type: 'FeatureCollection', features: [] }); } });
    return () => { m.remove(); map.current = null; };
  }, [style]);
  useEffect(() => { const m = map.current; if (!m) return; const update = () => (m.getSource('network') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: assets.map(a => ({ type: 'Feature', properties: { id: a.id, highlight: highlighted.includes(a.id) }, geometry: a.geometry })) }); if (m.isStyleLoaded()) update(); else m.once('load', update); return () => { m.off('load', update); }; }, [assets, highlighted]);
  useEffect(() => { if (center) map.current?.flyTo({ center, zoom: 16 }); }, [center]);
  useEffect(() => { points.current = []; const m = map.current; if (m) { m.getCanvas().style.cursor = mode === 'select' ? '' : 'crosshair'; if (mode === 'line') m.doubleClickZoom.disable(); else m.doubleClickZoom.enable(); (m.getSource('draft') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] }); } }, [mode]);
  return <div className="map-frame"><div ref={host} className="map-canvas" />{!style && <div className="map-config"><div className="map-grid-icon">⌖</div><h2>O ponto de partida da sua rede</h2><p>Configure um provedor cartográfico para visualizar o mapa real e desenhar sua infraestrutura.</p><code>NEXT_PUBLIC_MAP_STYLE_URL</code><small>Nenhum equipamento ou trajeto fictício foi adicionado.</small></div>}{error && <div className="map-error">{error}</div>}<div className="map-caption"><span className="live-dot" />Inventário documental<span>·</span> SIRGAS / WGS 84 · Coordenadas geográficas</div></div>;
}
