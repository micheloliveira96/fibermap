export class LocationError extends Error {
  constructor(public code: number) {
    super(
      code === 1
        ? "Localização bloqueada. Permita a localização deste site e ative a localização no dispositivo. Se o navegador integrado não oferecer localização, abra o FiberMap no navegador do aparelho."
        : code === 2
          ? "O dispositivo não conseguiu determinar sua posição. Verifique a localização do aparelho e tente novamente."
          : "A localização demorou para responder. Vá para uma área com melhor sinal e tente novamente.",
    );
  }
}

// A low-accuracy retry also supports desktops without a dedicated GPS receiver.
// Native callbacks are ignored after cancellation or the bounded waiting period.
export async function locateDevice(
  geo: Pick<Geolocation, "getCurrentPosition">,
  signal?: AbortSignal,
): Promise<GeolocationPosition> {
  const attempt = (high: boolean) =>
    new Promise<GeolocationPosition>((resolve, reject) => {
      let settled = false;
      const finish = (value: GeolocationPosition | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        if (value instanceof Error) reject(value);
        else resolve(value);
      };
      const cancel = () =>
        finish(new DOMException("Localização cancelada.", "AbortError"));
      const timeout = high ? 10000 : 15000,
        timer = setTimeout(() => finish(new LocationError(3)), timeout + 2000);
      if (signal?.aborted) {
        cancel();
        return;
      }
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        geo.getCurrentPosition(
          (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            if (
              !Number.isFinite(latitude) ||
              !Number.isFinite(longitude) ||
              Math.abs(latitude) > 90 ||
              Math.abs(longitude) > 180 ||
              !Number.isFinite(accuracy) ||
              accuracy < 0
            ) {
              finish(new LocationError(2));
              return;
            }
            finish(position);
          },
          (error) => finish(new LocationError(error.code)),
          { enableHighAccuracy: high, timeout, maximumAge: high ? 0 : 60000 },
        );
      } catch (error) {
        finish(error instanceof Error ? error : new LocationError(2));
      }
    });
  try {
    return await attempt(true);
  } catch (error) {
    if (error instanceof LocationError && error.code !== 1)
      return attempt(false);
    throw error;
  }
}
