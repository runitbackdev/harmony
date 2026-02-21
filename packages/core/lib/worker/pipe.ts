export async function pipe<T>(
  reader: ReadableStreamDefaultReader<T>,
  onChunk: (chunk: T) => void,
) {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(value);
    }
  } catch {
    // reader was cancelled
  }
}
