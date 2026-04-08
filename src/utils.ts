/**
 * Converts R, G, B channel values to a zero-padded 6-character lowercase hex key.
 * This is the single source of truth for hex key derivation throughout the library.
 *
 * @example toHexKey(0, 77, 153) === "004d99"
 */
export function toHexKey(r: number, g: number, b: number): string {
  return (
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  )
}
