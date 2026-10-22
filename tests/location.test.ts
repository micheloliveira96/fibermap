import { afterEach, describe, expect, it, vi } from "vitest";
import { locateDevice, LocationError } from "../src/lib/location";
const position = {
  coords: { latitude: -23.55, longitude: -46.63, accuracy: 25 },
  timestamp: Date.now(),
} as GeolocationPosition;
afterEach(() => vi.useRealTimers());
describe("localização do dispositivo", () => {
  it("retorna coordenadas e precisão reais fornecidas pelo navegador", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok(position));
    expect(await locateDevice({ getCurrentPosition })).toBe(position);
    expect(getCurrentPosition.mock.calls).toHaveLength(1);
  });
  it("tenta baixa precisão quando a tentativa de GPS falha", async () => {
    const getCurrentPosition = vi.fn(
      (
        ok: PositionCallback,
        error?: PositionErrorCallback | null,
        options?: PositionOptions,
      ) =>
        options?.enableHighAccuracy
          ? error?.({ code: 3 } as GeolocationPositionError)
          : ok(position),
    );
    expect(await locateDevice({ getCurrentPosition })).toBe(position);
    expect(
      getCurrentPosition.mock.calls.map((c) => c[2]?.enableHighAccuracy),
    ).toEqual([true, false]);
  });
  it("explica permissão negada sem insistir em outra solicitação", async () => {
    const getCurrentPosition = vi.fn(
      (_ok: PositionCallback, error?: PositionErrorCallback | null) =>
        error?.({ code: 1 } as GeolocationPositionError),
    );
    await expect(locateDevice({ getCurrentPosition })).rejects.toThrow(
      "Permita a localização",
    );
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
  it("cancela e ignora callbacks atrasados", async () => {
    const controller = new AbortController();
    let success: PositionCallback = () => {};
    const pending = locateDevice(
      {
        getCurrentPosition: (ok) => {
          success = ok;
        },
      },
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    success(position);
  });
  it("encerra a espera mesmo quando o navegador não chama os callbacks", async () => {
    vi.useFakeTimers();
    const pending = locateDevice({ getCurrentPosition: () => {} });
    const assertion = expect(pending).rejects.toBeInstanceOf(LocationError);
    await vi.advanceTimersByTimeAsync(30000);
    await assertion;
  });
});
