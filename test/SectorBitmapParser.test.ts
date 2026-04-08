import { describe, it, expect } from 'vitest'
import { SectorBitmapParser } from '../src/SectorBitmapParser'

const parser = new SectorBitmapParser()

describe('SectorBitmapParser', () => {
  describe('URL path', () => {
    it('resolves with correct dimensions for 4x4 fixture', async () => {
      const result = await parser.parse('/test/fixtures/test-4x4.png')
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
      expect(result.buffer.length).toBe(64)
    })

    it('pixel (0,0) is red', async () => {
      const { buffer } = await parser.parse('/test/fixtures/test-4x4.png')
      expect(buffer[0]).toBe(0xff) // R
      expect(buffer[1]).toBe(0x00) // G
      expect(buffer[2]).toBe(0x00) // B
    })

    it('pixel (2,0) flat index 8 is green', async () => {
      const { buffer } = await parser.parse('/test/fixtures/test-4x4.png')
      expect(buffer[8]).toBe(0x00) // R
      expect(buffer[9]).toBe(0xff) // G
      expect(buffer[10]).toBe(0x00) // B
    })

    it('pixel (0,2) flat index 32 is blue', async () => {
      const { buffer } = await parser.parse('/test/fixtures/test-4x4.png')
      expect(buffer[32]).toBe(0x00) // R
      expect(buffer[33]).toBe(0x00) // G
      expect(buffer[34]).toBe(0xff) // B
    })

    it('pixel (2,2) flat index 40 is yellow', async () => {
      const { buffer } = await parser.parse('/test/fixtures/test-4x4.png')
      expect(buffer[40]).toBe(0xff) // R
      expect(buffer[41]).toBe(0xff) // G
      expect(buffer[42]).toBe(0x00) // B
    })

    it('all alpha bytes are 255', async () => {
      const { buffer } = await parser.parse('/test/fixtures/test-4x4.png')
      for (let i = 3; i < buffer.length; i += 4) {
        expect(buffer[i]).toBe(255)
      }
    })
  })

  describe('Blob path', () => {
    it('resolves identically to URL path', async () => {
      const blob = await fetch('/test/fixtures/test-4x4.png').then(r =>
        r.blob()
      )
      const result = await parser.parse(blob)
      expect(result.width).toBe(4)
      expect(result.height).toBe(4)
      expect(result.buffer.length).toBe(64)
      expect(result.buffer[0]).toBe(0xff)
      expect(result.buffer[1]).toBe(0x00)
      expect(result.buffer[2]).toBe(0x00)
    })
  })

  describe('error cases', () => {
    it('rejects for an invalid file type', async () => {
      await expect(
        parser.parse('/test/fixtures/test-invalid.txt')
      ).rejects.toThrow()
    })

    it('rejects with HTTP 404 message for a missing file', async () => {
      // /test/__404__ is a test-only endpoint served by the Vite plugin in vite.config.ts
      // that returns a genuine HTTP 404 (the SPA fallback swallows 404s for unknown static paths)
      await expect(parser.parse('/test/__404__')).rejects.toThrow('HTTP 404')
    })

    it('rejects for an unreachable host', async () => {
      await expect(
        parser.parse('https://nonexistent.invalid/image.png')
      ).rejects.toThrow()
    })

    it('rejects for non-string non-Blob input', async () => {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parser.parse(42 as any)
      ).rejects.toThrow('source must be a string URL or Blob')
    })
  })
})
