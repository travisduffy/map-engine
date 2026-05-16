/**
 * Converts R, G, B channel values to a zero-padded 6-character lowercase hex key.
 * This is the single source of truth for hex key derivation throughout the library.
 *
 * @example toHexKey(0, 77, 153) === "004d99"
 */
const _HEX = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, '0')
)

export function toHexKey(r: number, g: number, b: number): string {
  return _HEX[r] + _HEX[g] + _HEX[b]
}
