import { UploadApiTs } from '../../../packages/sdk-ts/src/upload-client.js';

export async function uploadFileWithTus(params: {
  apiBaseUrl: string;
  token: string;
  workspaceId: string;
  userId: string;
  file: File;
  uploadType: 'avatar' | 'audio' | 'video' | 'deck_asset';
}) {
  const api = new UploadApiTs(params.apiBaseUrl, params.token);
  const created = await api.createTusSession({
    workspace_id: params.workspaceId,
    user_id: params.userId,
    upload_type: params.uploadType,
    expected_size: params.file.size,
    metadata: { filename: params.file.name }
  });

  const sessionId = created.session_id as string;
  const chunkSize = 256 * 1024;
  let offset = 0;

  while (offset < params.file.size) {
    const chunk = params.file.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(await chunk.arrayBuffer());
    const patch = await api.uploadChunk(sessionId, offset, bytes);
    if (patch.status !== 204) {
      throw new Error(`Falha no upload chunk em ${offset}`);
    }
    offset += bytes.length;
  }

  return api.complete(sessionId);
}
