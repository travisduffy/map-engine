// Precomputed 256-entry byte → two-hex-digit lookup table backing toHexKey.
const _HEX = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
)

/**
 * Converts R, G, B channel values to a zero-padded 6-character lowercase hex key.
 * This is the single source of truth for hex key derivation throughout the library.
 *
 * @example toHexKey(0, 77, 153) === "004d99"
 */
export function toHexKey(r: number, g: number, b: number): string {
  return _HEX[r] + _HEX[g] + _HEX[b]
}

/** @internal Packs R, G, B into a single 24-bit integer: (r<<16)|(g<<8)|b. Worker-safe. */
export function packRgb(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b
}
