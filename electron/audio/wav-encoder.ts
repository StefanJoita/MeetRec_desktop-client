/**
 * Pure function: mixes all PCM channels to mono, encodes to a standard
 * 44-byte WAV header + 16-bit little-endian PCM samples.
 */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Buffer {
  // Flatten all chunks into a single sample array (already mono from renderer)
  let totalSamples = 0
  for (const chunk of chunks) {
    totalSamples += chunk.length
  }

  const monoSamples = new Float32Array(totalSamples)
  let offset = 0
  for (const chunk of chunks) {
    monoSamples.set(chunk, offset)
    offset += chunk.length
  }

  // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
  const pcm16 = new Int16Array(monoSamples.length)
  for (let i = 0; i < monoSamples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, monoSamples[i]))
    pcm16[i] = clamped < 0 ? clamped * 32768 : clamped * 32767
  }

  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = pcm16.length * 2 // 2 bytes per Int16 sample
  const headerSize = 44

  const buffer = Buffer.alloc(headerSize + dataSize)
  let pos = 0

  // RIFF chunk descriptor
  buffer.write('RIFF', pos); pos += 4
  buffer.writeUInt32LE(36 + dataSize, pos); pos += 4
  buffer.write('WAVE', pos); pos += 4

  // fmt sub-chunk
  buffer.write('fmt ', pos); pos += 4
  buffer.writeUInt32LE(16, pos); pos += 4          // sub-chunk size (PCM = 16)
  buffer.writeUInt16LE(1, pos); pos += 2           // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(numChannels, pos); pos += 2
  buffer.writeUInt32LE(sampleRate, pos); pos += 4
  buffer.writeUInt32LE(byteRate, pos); pos += 4
  buffer.writeUInt16LE(blockAlign, pos); pos += 2
  buffer.writeUInt16LE(bitsPerSample, pos); pos += 2

  // data sub-chunk
  buffer.write('data', pos); pos += 4
  buffer.writeUInt32LE(dataSize, pos); pos += 4

  // PCM samples (little-endian)
  for (let i = 0; i < pcm16.length; i++) {
    buffer.writeInt16LE(pcm16[i], pos)
    pos += 2
  }

  return buffer
}
