// ============================================================================
// AI Assistant Providers - Patient 360 Mobile
// Triage controller + Emergency reports history
// ============================================================================

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../auth/presentation/providers/auth_provider.dart';
import '../../data/ai_repository.dart';
import '../../data/location_helper.dart';
import '../../domain/emergency_location.dart';
import '../../domain/emergency_report.dart';

// Type aliases - keeps generic types on a SINGLE line so encoding/wrapping
// issues from text editors cannot break the parser.
// `EmergencyReportsList` is public because it surfaces through the
// `EmergencyReportsController` and `emergencyReportsProvider` public APIs.
// The state aliases stay private — they're only used inside this file.
typedef EmergencyReportsList = List<EmergencyReport>;
typedef _ReportsState = AsyncValue<EmergencyReportsList>;
typedef _TriageState = AsyncValue<EmergencyReport?>;

// Strategy provider for location resolution.
final Provider<LocationHelper> locationHelperProvider =
    Provider<LocationHelper>((Ref ref) => const GeolocatorLocationHelper());

// ============================================================================
// Triage - text / image / voice
// ============================================================================

class TriageController extends AsyncNotifier<EmergencyReport?> {
  @override
  Future<EmergencyReport?> build() async => null;

  Future<EmergencyReport?> submitText(String text) async {
    return _submit(inputType: 'text', textDescription: text);
  }

  Future<EmergencyReport?> submitImage(
    XFile image, {
    String? textDescription,
  }) async {
    final bool hasText =
        textDescription != null && textDescription.trim().isNotEmpty;
    return _submit(
      inputType: hasText ? 'combined' : 'image',
      textDescription: hasText ? textDescription : null,
      imageFile: image,
    );
  }

  Future<EmergencyReport?> submitVoice(XFile audio) async {
    return _submit(inputType: 'voice', audioFile: audio);
  }

  Future<EmergencyReport?> _submit({
    required String inputType,
    String? textDescription,
    XFile? imageFile,
    XFile? audioFile,
  }) async {
    state = const _TriageState.loading();

    // Try GPS first, fall back to patient's registered governorate.
    // Submission NEVER fails for missing location.
    final String? governorate = ref
        .read(authControllerProvider)
        .value
        ?.person
        ?.governorate;

    final EmergencyLocation loc = await ref
        .read(locationHelperProvider)
        .getLocationOrGovernorateFallback(governorate: governorate);

    state = await AsyncValue.guard<EmergencyReport?>(
      () => ref
          .read(aiRepositoryProvider)
          .submitEmergencyReport(
            inputType: inputType,
            textDescription: textDescription,
            imageFile: imageFile,
            audioFile: audioFile,
            location: loc,
          ),
    );

    final EmergencyReport? report = state.value;
    if (report != null) {
      // ignore: unawaited_futures
      ref.read(emergencyReportsProvider.notifier).refresh();
    }
    return report;
  }

  void clear() {
    state = const _TriageState.data(null);
  }
}

final triageControllerProvider =
    AsyncNotifierProvider<TriageController, EmergencyReport?>(
      TriageController.new,
    );

// ============================================================================
// Emergency reports history
// ============================================================================

class EmergencyReportsController extends AsyncNotifier<EmergencyReportsList> {
  @override
  Future<EmergencyReportsList> build() async {
    return ref.read(aiRepositoryProvider).getEmergencyReports();
  }

  Future<void> refresh() async {
    state = const _ReportsState.loading();
    state = await AsyncValue.guard<EmergencyReportsList>(
      () => ref.read(aiRepositoryProvider).getEmergencyReports(),
    );
  }
}

final emergencyReportsProvider =
    AsyncNotifierProvider<EmergencyReportsController, EmergencyReportsList>(
      EmergencyReportsController.new,
    );
