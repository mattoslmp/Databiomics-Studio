export type CreateTusSessionInput = {
  workspace_id: string;
  user_id: string;
  upload_type: 'avatar' | 'audio' | 'video' | 'deck_asset';
  expected_size: number;
  metadata?: Record<string, string>;
};

export class UploadApiTs {
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private headers(extra: Record<string, string> = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      ...extra
    };
  }

  async createTusSession(input: CreateTusSessionInput) {
    const res = await fetch(`${this.baseUrl}/uploads/tus`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input)
    });
    return res.json();
  }

  async uploadChunk(sessionId: string, offset: number, chunk: Uint8Array) {
    const res = await fetch(`${this.baseUrl}/uploads/tus/${sessionId}`, {
      method: 'PATCH',
      headers: this.headers({
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(offset),
        'Content-Type': 'application/offset+octet-stream'
      }),
      body: chunk
    });
    return { status: res.status, nextOffset: res.headers.get('Upload-Offset') };
  }

  async getTusSessionOffset(sessionId: string) {
    const res = await fetch(`${this.baseUrl}/uploads/tus/${sessionId}`, {
      method: 'HEAD',
      headers: this.headers({ 'Tus-Resumable': '1.0.0' })
    });

    return {
      status: res.status,
      offset: res.headers.get('Upload-Offset'),
      length: res.headers.get('Upload-Length')
    };
  }

  async complete(sessionId: string, sha256?: string) {
    const res = await fetch(`${this.baseUrl}/uploads/tus/${sessionId}/complete`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(sha256 ? { sha256 } : {})
    });
    return res.json();
  }

  async getSession(sessionId: string) {
    const res = await fetch(`${this.baseUrl}/uploads/sessions/${sessionId}`, {
      headers: this.headers()
    });
    return res.json();
  }
}
