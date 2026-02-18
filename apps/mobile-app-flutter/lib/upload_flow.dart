import 'dart:typed_data';
import 'package:databiomics_sdk_dart/upload_client.dart';

Future<Map<String, dynamic>> uploadBytesWithTus({
  required UploadApiDart api,
  required String workspaceId,
  required String userId,
  required String uploadType,
  required Uint8List bytes,
}) async {
  final created = await api.createTusSession({
    'workspace_id': workspaceId,
    'user_id': userId,
    'upload_type': uploadType,
    'expected_size': bytes.length,
    'metadata': {'filename': 'mobile-upload.bin'}
  });

  final sessionId = created['session_id'] as String;
  const chunkSize = 256 * 1024;
  var offset = 0;

  while (offset < bytes.length) {
    final end = (offset + chunkSize > bytes.length) ? bytes.length : offset + chunkSize;
    final chunk = Uint8List.sublistView(bytes, offset, end);
    final status = await api.uploadChunk(sessionId, offset, chunk);
    if (status != 204) {
      throw Exception('Falha ao enviar chunk no offset $offset');
    }
    offset = end;
  }

  return api.complete(sessionId);
}
