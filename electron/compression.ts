import zlib from 'node:zlib'
import LZ4 from 'lz4js'
import SnappyJS from 'snappyjs'
import { CompressionCodecs, CompressionTypes } from 'kafkajs'

// snappy-java, which every JVM producer uses, wraps blocks in the "xerial" framing
// rather than emitting a bare snappy stream. Without this header handling, decoding
// a topic produced by a Java service fails outright.
const XERIAL_MAGIC = Buffer.from([0x82, 0x53, 0x4e, 0x41, 0x50, 0x50, 0x59, 0x00])
const XERIAL_HEADER_LENGTH = XERIAL_MAGIC.length + 8

function isXerial(buffer: Buffer) {
  return buffer.length >= XERIAL_HEADER_LENGTH && buffer.subarray(0, XERIAL_MAGIC.length).equals(XERIAL_MAGIC)
}

function toBuffer(value: ArrayBuffer | Uint8Array): Buffer {
  return Buffer.isBuffer(value) ? value : Buffer.from(value as ArrayBuffer)
}

function snappyDecompress(buffer: Buffer): Buffer {
  if (!isXerial(buffer)) return toBuffer(SnappyJS.uncompress(buffer))

  const blocks: Buffer[] = []
  let offset = XERIAL_HEADER_LENGTH
  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    if (length === 0 || offset + length > buffer.length) break
    blocks.push(toBuffer(SnappyJS.uncompress(buffer.subarray(offset, offset + length))))
    offset += length
  }
  return Buffer.concat(blocks)
}

function snappyCompress(buffer: Buffer): Buffer {
  const compressed = toBuffer(SnappyJS.compress(buffer))
  const header = Buffer.alloc(XERIAL_HEADER_LENGTH)
  XERIAL_MAGIC.copy(header)
  header.writeInt32BE(1, XERIAL_MAGIC.length) // version
  header.writeInt32BE(1, XERIAL_MAGIC.length + 4) // compatible version
  const length = Buffer.alloc(4)
  length.writeUInt32BE(compressed.length)
  return Buffer.concat([header, length, compressed])
}

/**
 * kafkajs implements gzip only and throws for everything else, which crashes the
 * consumer mid-batch and leaves a partial result behind. Register what we can.
 */
export function registerCompressionCodecs() {
  CompressionCodecs[CompressionTypes.Snappy] = () => ({
    compress: (encoder: { buffer: Buffer }) => Promise.resolve(snappyCompress(encoder.buffer)),
    decompress: (buffer: Buffer) => Promise.resolve(snappyDecompress(buffer)),
  })

  // Kafka's record batches carry standard LZ4 frames, which is what lz4js emits.
  CompressionCodecs[CompressionTypes.LZ4] = () => ({
    compress: (encoder: { buffer: Buffer }) => Promise.resolve(toBuffer(LZ4.compress(encoder.buffer))),
    decompress: (buffer: Buffer) => Promise.resolve(toBuffer(LZ4.decompress(buffer))),
  })

  // zstd arrived in Node 22.15; Electron may predate that, so only claim support
  // when the runtime actually has it.
  const zstdDecompress = zlib.zstdDecompressSync as ((buffer: Buffer) => Buffer) | undefined
  const zstdCompress = zlib.zstdCompressSync as ((buffer: Buffer) => Buffer) | undefined
  if (typeof zstdDecompress === 'function' && typeof zstdCompress === 'function') {
    CompressionCodecs[CompressionTypes.ZSTD] = () => ({
      compress: (encoder: { buffer: Buffer }) => Promise.resolve(zstdCompress(encoder.buffer)),
      decompress: (buffer: Buffer) => Promise.resolve(zstdDecompress(buffer)),
    })
  }
}

/** Names the codec a record batch used, for error messages about the ones we lack. */
export function describeCodec(type: number) {
  return (
    Object.entries(CompressionTypes).find(([, value]) => value === type)?.[0] ?? `type ${type}`
  )
}
