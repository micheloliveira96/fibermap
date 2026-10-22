import { access, ApiError, failure } from "@/lib/access";
const cache = new Map<string, { at: number; features: unknown[] }>(),
  requests = new Map<string, number>();
export async function GET(r: Request) {
  try {
    const m = await access(),
      q = new URL(r.url).searchParams.get("q")?.trim() ?? "";
    if (q.length < 3 || q.length > 160)
      throw new ApiError(400, "Informe um endereço entre 3 e 160 caracteres.");
    const hit = cache.get(q);
    if (hit && Date.now() - hit.at < 3600000)
      return Response.json(hit.features);
    if (Date.now() - (requests.get(m.organizationId) ?? 0) < 1500)
      throw new ApiError(429, "Aguarde antes de pesquisar novamente.");
    if (requests.size > 1000) requests.clear();
    requests.set(m.organizationId, Date.now());
    const url = new URL(
      process.env.GEOCODER_URL ?? "https://photon.komoot.io/api/",
    );
    url.searchParams.set("q", q);
    url.searchParams.set("limit", "5");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new ApiError(
        503,
        "Serviço de endereços indisponível. Pesquise por coordenadas.",
      );
    const data = await response.json();
    const features = (data.features ?? [])
      .filter(
        (f: { geometry?: { type?: string; coordinates?: unknown[] } }) =>
          f.geometry?.type === "Point" && f.geometry.coordinates?.length === 2,
      )
      .map(
        (f: {
          geometry: { coordinates: number[] };
          properties: Record<string, string>;
        }) => ({
          coordinates: f.geometry.coordinates,
          label: [
            f.properties.name,
            f.properties.street,
            f.properties.housenumber,
            f.properties.city,
            f.properties.state,
            f.properties.country,
          ]
            .filter(Boolean)
            .join(", "),
        }),
      );
    if (cache.size > 500) cache.clear();
    cache.set(q, { at: Date.now(), features });
    return Response.json(features);
  } catch (e) {
    return failure(e);
  }
}
