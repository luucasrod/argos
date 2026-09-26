import { Audio } from 'expo-av';
import { synthesizeBase64, stopCloudSpeech } from './cloudTts';
import { stopAllSpeech } from './textToSpeech';
import { perfMark, perfEnd } from './perfLog';

const MIN_CHUNK_SIZE = 50;

interface AudioSegment {
  uri: string;
  status: 'pending' | 'playing' | 'done';
}

export class StreamingTtsBuffer {
  private buffer = '';
  private minChunkSize: number;

  constructor(minChunkSize = MIN_CHUNK_SIZE) {
    this.minChunkSize = minChunkSize;
  }

  addToken(token: string): string | null {
    this.buffer += token;

    if (this.buffer.length >= this.minChunkSize) {
      const text = this.buffer.slice(0, this.minChunkSize);
      this.buffer = this.buffer.slice(this.minChunkSize);
      return text;
    }
    return null;
  }

  /** Extrai todos os chunks prontos do buffer chamando addToken('') repetidamente. */
  drainAll(): string[] {
    const chunks: string[] = [];
    while (true) {
      const chunk = this.addToken('');
      if (chunk === null) break;
      chunks.push(chunk);
    }
    return chunks;
  }

  get length(): number {
    return this.buffer.length;
  }
}

class AudioQueue {
  private queue: AudioSegment[] = [];
  private isPlaying = false;
  private cancelled = false;

  async enqueue(uri: string): Promise<void> {
    this.queue.push({ uri, status: 'pending' });
    if (!this.isPlaying) {
      await this.playLoop();
    }
  }

  private async playLoop(): Promise<void> {
    this.isPlaying = true;
    try {
      while (this.queue.length > 0 && !this.cancelled) {
        const segment = this.queue[0];
        if (!segment) break;

        perfMark('streaming_tts_playback_inicio');

        try {
          const { sound } = await Audio.Sound.createAsync(
            { uri: segment.uri },
            { shouldPlay: true, volume: 1 }
          );

          await new Promise<void>((resolve) => {
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              resolve();
            };
            sound.setOnPlaybackStatusUpdate((st) => {
              if (!st.isLoaded || st.didJustFinish) finish();
            });
            setTimeout(finish, 60000);
          });

          await sound.unloadAsync();
          perfEnd('streaming_tts_playback_terminado');
        } catch {
          perfMark('streaming_tts_playback_erro');
        }

        this.queue.shift();
      }
    } finally {
      this.isPlaying = false;
    }
  }

  async stop(): Promise<void> {
    this.cancelled = true;
    this.queue = [];
    await stopCloudSpeech();
    await stopAllSpeech();
  }

  get queueLength(): number {
    return this.queue.length;
  }
}

async function synthesizeChunk(text: string): Promise<string | null> {
  try {
    const base64 = await synthesizeBase64(text.trim(), {
      rate: 1.0,
      gender: 'female',
    });
    if (!base64) return null;
    return `data:audio/mp3;base64,${base64}`;
  } catch {
    return null;
  }
}

export interface StreamingTtsOptions {
  personality: {
    language: string;
    voiceGender: 'female' | 'male';
    voiceSpeed: number;
  };
  cancelled?: () => boolean;
}

export class StreamingTtsEngine {
  private buffer: StreamingTtsBuffer;
  private queue: AudioQueue;
  private options: StreamingTtsOptions;

  constructor(options: StreamingTtsOptions) {
    this.buffer = new StreamingTtsBuffer();
    this.queue = new AudioQueue();
    this.options = options;
  }

  async processToken(token: string): Promise<void> {
    if (this.options.cancelled?.()) return;

    this.buffer.addToken(token);

    const chunks = this.buffer.drainAll();
    for (const text of chunks) {
      const uri = await synthesizeChunk(text);
      if (uri && !this.options.cancelled?.()) {
        await this.queue.enqueue(uri);
      }
    }
  }

  async flush(): Promise<void> {
    const remaining = this.buffer.flush();
    if (remaining && !this.options.cancelled?.()) {
      const uri = await synthesizeChunk(remaining);
      if (uri) {
        await this.queue.enqueue(uri);
      }
    }
  }

  async stop(): Promise<void> {
    await this.queue.stop();
  }
}

export async function createStreamingTtsEngine(options: StreamingTtsOptions): Promise<StreamingTtsEngine> {
  return new StreamingTtsEngine(options);
}
