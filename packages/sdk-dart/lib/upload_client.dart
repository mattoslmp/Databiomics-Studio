import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;

class UploadApiDart {
  UploadApiDart({required this.baseUrl, required this.token});

  final String baseUrl;
  final String token;

  Map<String, String> _headers([Map<String, String>? extra]) => {
        'Authorization': 'Bearer $token',
        ...?extra,
      };

  Future<Map<String, dynamic>> createTusSession(Map<String, dynamic> payload) async {
    final response = await http.post(
      Uri.parse('$baseUrl/uploads/tus'),
      headers: _headers({'Content-Type': 'application/json'}),
      body: jsonEncode(payload),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<int> uploadChunk(String sessionId, int offset, Uint8List bytes) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/uploads/tus/$sessionId'),
      headers: _headers({
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': '$offset',
        'Content-Type': 'application/offset+octet-stream',
      }),
      body: bytes,
    );
    return response.statusCode;
  }

  Future<Map<String, dynamic>> getTusSessionOffset(String sessionId) async {
    final response = await http.head(
      Uri.parse('$baseUrl/uploads/tus/$sessionId'),
      headers: _headers({'Tus-Resumable': '1.0.0'}),
    );
    return {
      'status': response.statusCode,
      'offset': response.headers['upload-offset'],
      'length': response.headers['upload-length'],
    };
  }

  Future<Map<String, dynamic>> complete(String sessionId, {String? sha256}) async {
    final response = await http.post(
      Uri.parse('$baseUrl/uploads/tus/$sessionId/complete'),
      headers: _headers({'Content-Type': 'application/json'}),
      body: jsonEncode(sha256 == null ? {} : {'sha256': sha256}),
    );
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
