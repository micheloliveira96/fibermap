// This is deliberately a public browser token, never a Mapbox secret token.
export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.MAPBOX_PUBLIC_TOKEN;
  if (!token?.startsWith("pk.")) {
    return Response.json(
      { error: "Satélite Mapbox não configurado." },
      { status: 503 },
    );
  }
  return Response.json(
    {
      version: 8,
      name: "Satélite · Mapbox",
      glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      sources: {
        satellite: {
          type: "raster",
          tiles: [
            `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/512/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
          ],
          tileSize: 512,
          minzoom: 0,
          maxzoom: 22,
          attribution:
            '<a href="https://www.mapbox.com/about/maps" target="_blank">© Mapbox</a> <a href="https://www.openstreetmap.org/copyright/" target="_blank">© OpenStreetMap</a> <a href="https://www.mapbox.com/contribute/" target="_blank">Improve this map</a> <a href="https://www.maxar.com/" target="_blank">© Maxar</a>',
        },
      },
      layers: [
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          paint: { "raster-fade-duration": 200 },
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
