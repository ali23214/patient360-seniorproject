import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../domain/emergency_location.dart';
import '../domain/emergency_report.dart';
import '../domain/specialist_result.dart';

/// All AI-assistant network access flows through this repository so the UI
/// stays Dio-agnostic and the unit tests can swap in a fake.
///
/// ─── LOCKED BACKEND CONTRACT (verified against routes/emergency.js) ────
/// Mounted at /api/emergency
///   POST   /                     submit emergency report (multipart)
///   GET    /mine                 patient's own report history
///   GET    /:id                  single report detail
///   POST   /:id/call-ambulance   trigger ambulance dispatch
///   POST   /:id/resolve          mark report resolved
///
/// Multipart field names the backend expects:
///   text           — Arabic description (NOT "textDescription")
///   image          — JPG/PNG/WebP file
///   audio          — WAV/MP3/M4A/WebM/OGG file (Phase 2 — voice mode)
///   location       — JSON string of GeoJSON Point:
///                    {"type":"Point","coordinates":[lng, lat]}
///   locationAddress, governorate — optional plain strings
class AiRepository {
  const AiRepository(this._dio);

  final Dio _dio;

  // ─── Specialist recommender ───────────────────────────────────────────
  // (Separate feature — left untouched in Phase 1.)

  /// POST `/api/patient/ai-symptom-analysis` with `{ symptoms }`. Returns
  /// the deserialized [SpecialistResult]. The schema is intentionally
  /// ephemeral — see CLAUDE.md "AI history storage" decision.
  Future<SpecialistResult> analyzeSymptoms({
    required String symptoms,
  }) async {
    try {
      final Response<dynamic> res = await _dio.post<dynamic>(
        '/patient/ai-symptom-analysis',
        data: <String, dynamic>{'symptoms': symptoms},
      );
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      // Backend may wrap the payload under `result` or return it flat.
      final Map<String, dynamic> raw = body.containsKey('result')
          ? (body['result'] as Map<dynamic, dynamic>).cast<String, dynamic>()
          : body;
      return SpecialistResult.fromJson(raw);
    } on DioException catch (e, st) {
      appLogger.e('analyzeSymptoms failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('analyzeSymptoms unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  // ─── Emergency triage ─────────────────────────────────────────────────

  /// Multipart POST `/api/emergency`. Accepts a text description, an
  /// image, OR a recorded audio clip (or text + image for `combined`);
  /// attaches a best-effort GPS reading when one is available.
  ///
  /// Returns the deserialized [EmergencyReport] from the backend so the
  /// UI can render the AI's risk level + first-aid steps immediately.
  Future<EmergencyReport> submitEmergencyReport({
    required String inputType,
    String? textDescription,
    XFile? imageFile,
    XFile? audioFile,
    EmergencyLocation? location,
  }) async {
    try {
      final FormData form = await buildEmergencyFormData(
        inputType: inputType,
        textDescription: textDescription,
        imageFile: imageFile,
        audioFile: audioFile,
        location: location,
      );
      final Response<dynamic> res = await _dio.post<dynamic>(
        '/emergency',
        data: form,
        options: Options(
          contentType: 'multipart/form-data',
          // Emergency endpoint may take 2-6 seconds when the real FastAPI
          // model is wired (Whisper transcription, AraBERT inference).
          // Voice mode in particular needs the full 90s for Whisper on
          // CPU. Override the global 15s timeout to be safe.
          sendTimeout: const Duration(seconds: 60),
          receiveTimeout: const Duration(seconds: 90),
        ),
      );
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final Object? rawReport = body['report'] ?? body['emergencyReport'];
      final Map<String, dynamic> reportJson = rawReport is Map
          ? rawReport.cast<String, dynamic>()
          : body;
      return EmergencyReport.fromJson(reportJson);
    } on DioException catch (e, st) {
      appLogger.e('submitEmergencyReport failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('submitEmergencyReport unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }

  /// Visible for tests — exposes the multipart payload assembly so the
  /// "fields included only when location != null" contract can be pinned
  /// without mocking Dio's transport.
  ///
  /// CRITICAL FIELD NAMES (must match backend exactly):
  ///   * Description field is `text` — NOT `textDescription`
  ///   * Location is GeoJSON Point: { type:'Point', coordinates:[lng,lat] }
  ///     — the backend's validateSyriaLocation() rejects { lat, lng } shape
  ///   * Image multipart field name is `image`
  ///   * Audio multipart field name is `audio` (recorded WAV @ 16 kHz mono
  ///     produced by InputAudio — matches Whisper's native input shape)
  static Future<FormData> buildEmergencyFormData({
    required String inputType,
    String? textDescription,
    XFile? imageFile,
    XFile? audioFile,
    EmergencyLocation? location,
  }) async {
    final Map<String, dynamic> fields = <String, dynamic>{
      'inputType': inputType,
    };

    // The backend reads `req.body.text` — sending under any other key
    // (e.g. textDescription) silently drops the description.
    if (inputType == 'text' || inputType == 'combined') {
      if (textDescription != null && textDescription.isNotEmpty) {
        fields['text'] = textDescription;
      }
    }

    // GeoJSON Point — coordinates are [longitude, latitude] per the
    // GeoJSON spec (RFC 7946) and MongoDB's 2dsphere index requirements.
    // Order matters: lng first, lat second.
    if (location != null) {
      fields['location'] = jsonEncode(<String, dynamic>{
        'type': 'Point',
        'coordinates': <double>[location.lng, location.lat],
      });
      if (location.accuracy != null) {
        fields['locationAccuracy'] = location.accuracy!.toString();
      }
    }

    final FormData form = FormData.fromMap(fields);

    if (imageFile != null &&
        (inputType == 'image' || inputType == 'combined')) {
      form.files.add(
        MapEntry<String, MultipartFile>(
          'image',
          await MultipartFile.fromFile(
            imageFile.path,
            filename: imageFile.name,
          ),
        ),
      );
    }

    // Audio attachment for voice mode. The backend's emergencyController
    // accepts the same set of media types it does for image uploads but
    // under the `audio` field name, and routes the file to FastAPI's
    // /predict/voice endpoint (Whisper transcription + classification).
    if (audioFile != null && inputType == 'voice') {
      form.files.add(
        MapEntry<String, MultipartFile>(
          'audio',
          await MultipartFile.fromFile(
            audioFile.path,
            filename: audioFile.name.isNotEmpty
                ? audioFile.name
                : 'recording.wav',
          ),
        ),
      );
    }

    return form;
  }

  // ─── History ──────────────────────────────────────────────────────────

  /// GET `/api/emergency/mine?page=1&limit=20`. v1 only loads the first
  /// page; pagination lands in a later prompt.
  Future<List<EmergencyReport>> getEmergencyReports({
    int page = 1,
    int limit = 20,
  }) async {
    try {
      final Response<dynamic> res = await _dio.get<dynamic>(
        '/emergency/mine',
        queryParameters: <String, dynamic>{'page': page, 'limit': limit},
      );
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final List<dynamic> raw =
          (body['reports'] as List<dynamic>?) ??
              (body['emergencyReports'] as List<dynamic>?) ??
              const <dynamic>[];
      return raw
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(EmergencyReport.fromJson)
          .toList()
        ..sort((EmergencyReport a, EmergencyReport b) =>
            b.reportedAt.compareTo(a.reportedAt));
    } on DioException catch (e, st) {
      appLogger.e('getEmergencyReports failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('getEmergencyReports unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

final Provider<AiRepository> aiRepositoryProvider = Provider<AiRepository>(
  (Ref ref) => AiRepository(ref.watch(dioProvider)),
);