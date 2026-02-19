import { UploadApiTs } from '../../../packages/sdk-ts/src/upload-client.js';

export async function uploadFileWithTus(params: {
  apiBaseUrl: string;
  token: string;
  workspaceId: string;
  userId: string;
  file: File;
  uploadType: 'avatar' | 'audio' | 'video' | 'deck_asset';
  existingSessionId?: string;
}) {
  const api = new UploadApiTs(params.apiBaseUrl, params.token);
  const chunkSize = 256 * 1024;
  let sessionId = params.existingSessionId;
  let offset = 0;

  if (sessionId) {
    const status = await api.getTusSessionOffset(sessionId);
    if (status.status === 404) {
      sessionId = undefined;
    } else if (status.status === 204) {
      const serverOffset = Number(status.offset ?? 0);
      const serverLength = Number(status.length ?? params.file.size);
      if (Number.isNaN(serverOffset) || Number.isNaN(serverLength)) {
        throw new Error('Resposta inválida do servidor para offset/length da sessão TUS');
      }
      if (serverLength !== params.file.size) {
        throw new Error('Tamanho do arquivo diverge da sessão TUS existente');
      }
      if (serverOffset < 0 || serverOffset > params.file.size) {
        throw new Error('Offset retornado pelo servidor está fora do intervalo esperado');
      }
      offset = serverOffset;
    } else {
      throw new Error(`Falha ao consultar sessão TUS existente: HTTP ${status.status}`);
    }
  }

  if (!sessionId) {
    const created = await api.createTusSession({
      workspace_id: params.workspaceId,
      user_id: params.userId,
      upload_type: params.uploadType,
      expected_size: params.file.size,
      metadata: { filename: params.file.name }
    });

    sessionId = created.session_id as string;
  }

  while (offset < params.file.size) {
    const chunk = params.file.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(await chunk.arrayBuffer());
    const patch = await api.uploadChunk(sessionId, offset, bytes);
    if (patch.status !== 204) {
      throw new Error(`Falha no upload chunk em ${offset}`);
    }
    const nextOffset = Number(patch.nextOffset);
    offset = Number.isNaN(nextOffset) ? offset + bytes.length : nextOffset;
  }

  return api.complete(sessionId);
}
