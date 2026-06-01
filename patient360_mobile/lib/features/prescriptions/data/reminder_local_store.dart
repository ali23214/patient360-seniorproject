import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/theme/theme_controller.dart'
    show sharedPreferencesProvider;
import '../../../core/utils/logger.dart';
import '../domain/reminders/adherence_record.dart';
import '../domain/reminders/reminder_schedule.dart';

/// Versioned namespace keys. Bumping the suffix on a breaking JSON change
/// keeps the old key around for one release so users don't lose data.
class ReminderStorageKeys {
  const ReminderStorageKeys._();
  static const String reminders = 'p360.reminders.v1';
  static const String adherence = 'p360.adherence.v1';
  static const String lastScheduledAt = 'p360.reminders.lastScheduledAt';
}

/// Reads and writes reminders + adherence to shared_preferences. The store
/// is intentionally tolerant of forward-version drift — unknown keys in the
/// stored JSON are ignored so a newer release adding fields can still load
/// data persisted by an older one.
class ReminderLocalStore {
  ReminderLocalStore(this._prefs);

  final SharedPreferences _prefs;

  Future<List<ReminderSchedule>> loadAll() async {
    final String? raw = _prefs.getString(ReminderStorageKeys.reminders);
    if (raw == null || raw.isEmpty) return <ReminderSchedule>[];
    try {
      final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(_safeParseSchedule)
          .whereType<ReminderSchedule>()
          .toList();
    } catch (e, st) {
      appLogger.w('reminder store decode failed', error: e, stackTrace: st);
      return <ReminderSchedule>[];
    }
  }

  Future<void> upsert(ReminderSchedule schedule) async {
    final List<ReminderSchedule> all = await loadAll();
    final int idx = all.indexWhere((ReminderSchedule s) => s.id == schedule.id);
    if (idx >= 0) {
      all[idx] = schedule;
    } else {
      all.add(schedule);
    }
    await _writeSchedules(all);
  }

  Future<void> removeById(String id) async {
    final List<ReminderSchedule> all = await loadAll();
    all.removeWhere((ReminderSchedule s) => s.id == id);
    await _writeSchedules(all);
  }

  Future<void> removeByPrescriptionId(String prescriptionId) async {
    final List<ReminderSchedule> all = await loadAll();
    all.removeWhere((ReminderSchedule s) => s.prescriptionId == prescriptionId);
    await _writeSchedules(all);
  }

  Future<void> clearAll() async {
    await _prefs.remove(ReminderStorageKeys.reminders);
    await _prefs.remove(ReminderStorageKeys.adherence);
    await _prefs.remove(ReminderStorageKeys.lastScheduledAt);
  }

  // ───── adherence ─────

  Future<void> recordAdherence(AdherenceRecord record) async {
    final List<AdherenceRecord> all = await _loadAllAdherence();
    all.add(record);
    await _writeAdherence(all);
  }

  Future<List<AdherenceRecord>> adherenceForRange(
    DateTime from,
    DateTime to,
  ) async {
    final List<AdherenceRecord> all = await _loadAllAdherence();
    return all
        .where(
          (AdherenceRecord r) =>
              !r.takenAt.isBefore(from) && r.takenAt.isBefore(to),
        )
        .toList();
  }

  Future<AdherenceRecord?> findAdherence({
    required String prescriptionId,
    required int medicationIndex,
    required DateTime scheduledAt,
  }) async {
    final List<AdherenceRecord> all = await _loadAllAdherence();
    for (final AdherenceRecord r in all) {
      if (r.prescriptionId == prescriptionId &&
          r.medicationIndex == medicationIndex &&
          r.scheduledAt == scheduledAt) {
        return r;
      }
    }
    return null;
  }

  Future<List<AdherenceRecord>> _loadAllAdherence() async {
    final String? raw = _prefs.getString(ReminderStorageKeys.adherence);
    if (raw == null || raw.isEmpty) return <AdherenceRecord>[];
    try {
      final List<dynamic> list = jsonDecode(raw) as List<dynamic>;
      return list
          .whereType<Map<dynamic, dynamic>>()
          .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
          .map(_safeParseAdherence)
          .whereType<AdherenceRecord>()
          .toList();
    } catch (e, st) {
      appLogger.w('adherence decode failed', error: e, stackTrace: st);
      return <AdherenceRecord>[];
    }
  }

  // ───── timestamps ─────

  Future<void> writeLastScheduledAt(DateTime when) async {
    await _prefs.setString(
      ReminderStorageKeys.lastScheduledAt,
      when.toIso8601String(),
    );
  }

  DateTime? readLastScheduledAt() {
    final String? raw = _prefs.getString(ReminderStorageKeys.lastScheduledAt);
    if (raw == null || raw.isEmpty) return null;
    try {
      return DateTime.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ───── private ─────

  Future<void> _writeSchedules(List<ReminderSchedule> all) async {
    final String encoded = jsonEncode(
      all.map((ReminderSchedule s) => s.toJson()).toList(),
    );
    await _prefs.setString(ReminderStorageKeys.reminders, encoded);
  }

  Future<void> _writeAdherence(List<AdherenceRecord> all) async {
    final String encoded = jsonEncode(
      all.map((AdherenceRecord r) => r.toJson()).toList(),
    );
    await _prefs.setString(ReminderStorageKeys.adherence, encoded);
  }

  static ReminderSchedule? _safeParseSchedule(Map<String, dynamic> m) {
    try {
      return ReminderSchedule.fromJson(m);
    } catch (e, st) {
      appLogger.w('skipping invalid reminder', error: e, stackTrace: st);
      return null;
    }
  }

  static AdherenceRecord? _safeParseAdherence(Map<String, dynamic> m) {
    try {
      return AdherenceRecord.fromJson(m);
    } catch (e, st) {
      appLogger.w('skipping invalid adherence', error: e, stackTrace: st);
      return null;
    }
  }
}

final Provider<ReminderLocalStore> reminderLocalStoreProvider =
    Provider<ReminderLocalStore>(
      (Ref ref) => ReminderLocalStore(ref.watch(sharedPreferencesProvider)),
    );
