import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../data/ai_repository.dart';
import '../../data/location_helper.dart';
import '../../domain/emergency_location.dart';
import '../../domain/emergency_report.dart';
import '../../domain/specialist_result.dart';

/// Strategy provider for location resolution. Tests override this with a
/// fake helper that returns a fixed [EmergencyLocation] (or null) without
/// touching the geolocator plugin.
final Provider<LocationHelper> locationHelperProvider =
    Provider<LocationHelper>((Ref ref) => const GeolocatorLocationHelper());

// ═══════════════════════════════════════════════════════════════════════════
// Specialist
// ═══════════════════════════════════════════════════════════════════════════

class SpecialistController extends AsyncNotifier<SpecialistResult?> {
  @override
  Future<SpecialistResult?> build() async => null;

  Future<void> submit(String symptoms) async {
    state = const AsyncValue<SpecialistResult?>.loading();
    state = await AsyncValue.guard<SpecialistResult?>(
      () => ref.read(aiRepositoryProvider).analyzeSymptoms(symptoms: symptoms),
    );
  }

  void clear() {
    state = const AsyncValue<SpecialistResult?>.data(null);
  }
}

final AsyncNotifierProvider<SpecialistController, SpecialistResult?>
    specialistControllerProvider =
    AsyncNotifierProvider<SpecialistController, SpecialistResult?>(
  SpecialistController.new,
);

// ═══════════════════════════════════════════════════════════════════════════
// Triage — text / image / voice
// ═══════════════════════════════════════════════════════════════════════════

class TriageController extends AsyncNotifier<EmergencyReport?> {
  @override
  Future<EmergencyReport?> build() async => null;

  /// Submit a free-text symptom description.
  Future<EmergencyReport?> submitText(String text) async {
    return _submit(inputType: 'text', textDescription: text);
  }

  /// Submit a captured image. The optional [textDescription] piggybacks
  /// only when the patient explicitly typed something alongside the photo.
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

  /// Submit a recorded WAV from InputAudio. Whisper-friendly format
  /// (16 kHz mono PCM) — see lib/.../widgets/input_audio.dart.
  Future<EmergencyReport?> submitVoice(XFile audio) async {
    return _submit(inputType: 'voice', audioFile: audio);
  }

  Future<EmergencyReport?> _submit({
    required String inputType,
    String? textDescription,
    XFile? imageFile,
    XFile? audioFile,
  }) async {
    state = const AsyncValue<EmergencyReport?>.loading();

    // Best-effort: 3 second ceiling on the GPS lookup. Always returns a
    // value (null on any failure) — never throws.
    final EmergencyLocation? loc = await ref
        .read(locationHelperProvider)
        .getCurrentLocationWithTimeout();

    state = await AsyncValue.guard<EmergencyReport?>(
      () => ref.read(aiRepositoryProvider).submitEmergencyReport(
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
    state = const AsyncValue<EmergencyReport?>.data(null);
  }
}

final AsyncNotifierProvider<TriageController, EmergencyReport?>
    triageControllerProvider =
    AsyncNotifierProvider<TriageController, EmergencyReport?>(
  TriageController.new,
);

// ═══════════════════════════════════════════════════════════════════════════
// History
// ═══════════════════════════════════════════════════════════════════════════

class EmergencyReportsController extends AsyncNotifier<List<EmergencyReport>> {
  @override
  Future<List<EmergencyReport>> build() async {
    return ref.read(aiRepositoryProvider).getEmergencyReports();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<EmergencyReport>>.loading();
    state = await AsyncValue.guard<List<EmergencyReport>>(
      () => ref.read(aiRepositoryProvider).getEmergencyReports(),
    );
  }
}

final AsyncNotifierProvider<EmergencyReportsController, List<EmergencyReport>>
    emergencyReportsProvider = AsyncNotifierProvider<
        EmergencyReportsController, List<EmergencyReport>>(
  EmergencyReportsController.new,
);