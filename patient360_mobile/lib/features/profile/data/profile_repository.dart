import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/utils/logger.dart';
import '../../auth/domain/auth_session.dart';
import '../../auth/domain/child.dart';
import '../../auth/domain/patient_profile.dart';
import '../../auth/domain/person.dart';
import '../domain/profile_update_dto.dart';

/// Profile-specific HTTP layer. Lives next to (not inside) the auth
/// repository so the auth layer doesn't need to know about the editable
/// profile schema.
class ProfileRepository {
  const ProfileRepository(this._dio);

  final Dio _dio;

  /// PATCH `/api/patient/profile`. The backend returns the updated
  /// `{ person, child, patient }` triple — same shape as
  /// `GET /api/patient/profile`.
  Future<UpdatedProfileBundle> updateMyProfile(ProfileUpdateDto dto) async {
    try {
      final Response<dynamic> res = await _dio.patch<dynamic>(
        '/patient/profile',
        data: dto.toJson(),
      );
      final Map<String, dynamic> body =
          (res.data as Map<dynamic, dynamic>).cast<String, dynamic>();
      final Map<String, dynamic>? personJson =
          (body['person'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();
      final Map<String, dynamic>? childJson =
          (body['child'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();
      final Map<String, dynamic>? patientJson =
          (body['patient'] as Map<dynamic, dynamic>?)?.cast<String, dynamic>();

      return UpdatedProfileBundle(
        person: personJson == null ? null : Person.fromJson(personJson),
        child: childJson == null ? null : Child.fromJson(childJson),
        patient: patientJson == null
            ? null
            : PatientProfile.fromJson(patientJson),
      );
    } on DioException catch (e, st) {
      appLogger.e('updateMyProfile failed', error: e, stackTrace: st);
      throw ApiException.fromDioError(e);
    } on ApiException {
      rethrow;
    } catch (e, st) {
      appLogger.e('updateMyProfile unknown', error: e, stackTrace: st);
      throw ApiException.unknown(e);
    }
  }
}

class UpdatedProfileBundle {
  const UpdatedProfileBundle({this.person, this.child, this.patient});
  final Person? person;
  final Child? child;
  final PatientProfile? patient;

  AuthSession applyTo(AuthSession session) {
    return AuthSession(
      jwt: session.jwt,
      user: session.user,
      patient: patient ?? session.patient,
      isMinor: session.isMinor,
      person: person ?? session.person,
      child: child ?? session.child,
    );
  }
}

final Provider<ProfileRepository> profileRepositoryProvider =
    Provider<ProfileRepository>(
  (Ref ref) => ProfileRepository(ref.watch(dioProvider)),
);
