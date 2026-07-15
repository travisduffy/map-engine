---
paths:
  - 'src/sector/**/*.ts'
  - 'src/shared/**/*.ts'
---

## Sector identity system

Every pixel's RGB value encodes a sector identity. The hex key (`"ff0000"` lowercase, no `#`) is the universal identifier connecting bitmap pixels to JSON definition entries. `toHexKey(r, g, b)` is the single conversion utility used throughout. `#000000` is the conventional void/non-interactive color. Internally, each sector also has a dense numeric ID (`0..sectorCount-1`); `idToHex: string[]` (Main-resident, never transferred) resolves numeric ID → hex key in O(1) for the picking pipeline.
