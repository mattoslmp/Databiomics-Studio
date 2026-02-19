import 'dart:typed_data';
import 'package:databiomics_sdk_dart/upload_client.dart';

Future<Map<String, dynamic>> uploadBytesWithTus({
  required UploadApiDart api,
  required String workspaceId,
  required String userId,
  required String uploadType,
  required Uint8List bytes,
  String? existingSessionId,
}) async {
  const chunkSize = 256 * 1024;
  var sessionId = existingSessionId;
  var offset = 0;

  if (sessionId != null) {
    final status = await api.getTusSessionOffset(sessionId);
    if (status['status'] == 404) {
      sessionId = null;
    } else if (status['status'] == 204) {
      final serverOffset = int.tryParse('${status['offset'] ?? 0}');
      final serverLength = int.tryParse('${status['length'] ?? bytes.length}');
      if (serverOffset == null || serverLength == null) {
        throw Exception('Resposta inválida do servidor para offset/length da sessão TUS');
      }
      if (serverLength != bytes.length) {
        throw Exception('Tamanho do arquivo diverge da sessão TUS existente');
      }
      if (serverOffset < 0 || serverOffset > bytes.length) {
        throw Exception('Offset retornado pelo servidor está fora do intervalo esperado');
      }
      offset = serverOffset;
    } else {
      throw Exception('Falha ao consultar sessão TUS existente: HTTP ${status['status']}');
    }
  }

  if (sessionId == null) {
    final created = await api.createTusSession({
      'workspace_id': workspaceId,
      'user_id': userId,
      'upload_type': uploadType,
      'expected_size': bytes.length,
      'metadata': {'filename': 'mobile-upload.bin'}
    });
    sessionId = created['session_id'] as String;
  }

  while (offset < bytes.length) {
    final end = (offset + chunkSize > bytes.length) ? bytes.length : offset + chunkSize;
    final chunk = Uint8List.sublistView(bytes, offset, end);
    final status = await api.uploadChunk(sessionId!, offset, chunk);
    if (status != 204) {
      throw Exception('Falha ao enviar chunk no offset $offset');
    }
    offset = end;
  }

  return api.complete(sessionId!);
}
