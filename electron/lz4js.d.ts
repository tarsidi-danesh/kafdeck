declare module 'lz4js' {
  /** Emits a standard LZ4 frame, the format Kafka record batches use. */
  export function compress(input: Uint8Array): Uint8Array
  export function decompress(input: Uint8Array): Uint8Array
}
