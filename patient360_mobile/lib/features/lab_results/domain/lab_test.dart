import 'package:flutter/foundation.dart';

import 'test_ordered.dart';
import 'test_result_row.dart';

/// Helper: extracts a string ID from a value that might be:
/// - null
/// - a String (already an ID)
/// - a Map (populated object from MongoDB — extract _id)
String? _idAsString(Object? v) {
  if (v == null) return null;
  if (v is String) return v.isEmpty ? null : v;
  if (v is Map) {
    final dynamic id = v['_id'] ?? v['id'];
    return id?.toString();
  }
  return v.toString();
}

/// Mirrors the `lab_tests` collection. Read-only from the mobile app —
/// the patient marks a completed test viewed but never modifies its
/// results, status, or attached PDF.
@immutable
class LabTest {
  const LabTest({
    required this.id,
    required this.testNumber,
    required this.orderDate,
    required this.testCategory,
    required this.priority,
    required this.status,
    required this.testsOrdered,
    required this.testResults,
    required this.isCritical,
    required this.isViewedByPatient,
    required this.createdAt,
    this.patientPersonId,
    this.patientChildId,
    this.orderedBy,
    this.visitId,
    this.laboratoryId,
    this.scheduledDate,
    this.sampleType,
    this.sampleId,
    this.sampleCollectedAt,
    this.rejectionReason,
    this.resultPdfUrl,
    this.resultPdfUploadedAt,
    this.labNotes,
    this.completedAt,
    this.patientViewedAt,
    this.totalCost,
  });

  factory LabTest.fromJson(Map<String, dynamic> json) {
    DateTime asDate(Object? v, {DateTime? fallback}) {
      if (v is String && v.isNotEmpty) return DateTime.parse(v);
      return fallback ?? DateTime.fromMillisecondsSinceEpoch(0);
    }

    DateTime? asDateOrNull(Object? v) =>
        v is String && v.isNotEmpty ? DateTime.parse(v) : null;

    final List<TestOrdered> testsOrdered =
        (json['testsOrdered'] as List<dynamic>?)
            ?.whereType<Map<dynamic, dynamic>>()
            .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
            .map(TestOrdered.fromJson)
            .toList() ??
        const <TestOrdered>[];

    final List<TestResultRow> testResults =
        (json['testResults'] as List<dynamic>?)
            ?.whereType<Map<dynamic, dynamic>>()
            .map((Map<dynamic, dynamic> m) => m.cast<String, dynamic>())
            .map(TestResultRow.fromJson)
            .toList() ??
        const <TestResultRow>[];

    return LabTest(
      id: (json['_id'] ?? json['id']).toString(),
      testNumber: (json['testNumber'] as String?) ?? '',
      patientPersonId: _idAsString(json['patientPersonId']),
      patientChildId: _idAsString(json['patientChildId']),
      orderedBy: _idAsString(json['orderedBy']),
      visitId: _idAsString(json['visitId']),
      laboratoryId: _idAsString(json['laboratoryId']),
      orderDate: asDate(json['orderDate']),
      scheduledDate: asDateOrNull(json['scheduledDate']),
      testsOrdered: testsOrdered,
      testCategory: (json['testCategory'] as String?) ?? '',
      priority: (json['priority'] as String?) ?? 'routine',
      sampleType: json['sampleType'] as String?,
      sampleId: json['sampleId'] as String?,
      sampleCollectedAt: asDateOrNull(json['sampleCollectedAt']),
      status: (json['status'] as String?) ?? 'ordered',
      rejectionReason: json['rejectionReason'] as String?,
      testResults: testResults,
      resultPdfUrl: json['resultPdfUrl'] as String?,
      resultPdfUploadedAt: asDateOrNull(json['resultPdfUploadedAt']),
      labNotes: json['labNotes'] as String?,
      completedAt: asDateOrNull(json['completedAt']),
      isCritical: (json['isCritical'] as bool?) ?? false,
      isViewedByPatient: (json['isViewedByPatient'] as bool?) ?? false,
      patientViewedAt: asDateOrNull(json['patientViewedAt']),
      totalCost: (json['totalCost'] as num?)?.toDouble(),
      createdAt: asDate(json['createdAt'], fallback: DateTime.now()),
    );
  }

  final String id;
  final String testNumber;
  final String? patientPersonId;
  final String? patientChildId;
  final String? orderedBy;
  final String? visitId;
  final String? laboratoryId;
  final DateTime orderDate;
  final DateTime? scheduledDate;
  final List<TestOrdered> testsOrdered;
  final String testCategory;
  final String priority;
  final String? sampleType;
  final String? sampleId;
  final DateTime? sampleCollectedAt;

  /// One of: `ordered | scheduled | sample_collected | in_progress |
  /// completed | cancelled | rejected`.
  final String status;
  final String? rejectionReason;
  final List<TestResultRow> testResults;
  final String? resultPdfUrl;
  final DateTime? resultPdfUploadedAt;
  final String? labNotes;
  final DateTime? completedAt;
  final bool isCritical;
  final bool isViewedByPatient;
  final DateTime? patientViewedAt;
  final double? totalCost;
  final DateTime createdAt;

  bool get isCompleted => status == 'completed';
  bool get hasResults => testResults.isNotEmpty;

  /// Count of result rows flagged abnormal (includes critical — critical
  /// is a *severity-amplified* form of abnormal in the schema).
  int get abnormalCount => testResults
      .where((TestResultRow r) => r.isAbnormal || r.isCritical)
      .length;

  /// Count of result rows flagged critical specifically. Drives the
  /// persistent SnackBar reminder on first expand.
  int get criticalCount =>
      testResults.where((TestResultRow r) => r.isCritical).length;

  LabTest copyWith({bool? isViewedByPatient, DateTime? patientViewedAt}) {
    return LabTest(
      id: id,
      testNumber: testNumber,
      patientPersonId: patientPersonId,
      patientChildId: patientChildId,
      orderedBy: orderedBy,
      visitId: visitId,
      laboratoryId: laboratoryId,
      orderDate: orderDate,
      scheduledDate: scheduledDate,
      testsOrdered: testsOrdered,
      testCategory: testCategory,
      priority: priority,
      sampleType: sampleType,
      sampleId: sampleId,
      sampleCollectedAt: sampleCollectedAt,
      status: status,
      rejectionReason: rejectionReason,
      testResults: testResults,
      resultPdfUrl: resultPdfUrl,
      resultPdfUploadedAt: resultPdfUploadedAt,
      labNotes: labNotes,
      completedAt: completedAt,
      isCritical: isCritical,
      isViewedByPatient: isViewedByPatient ?? this.isViewedByPatient,
      patientViewedAt: patientViewedAt ?? this.patientViewedAt,
      totalCost: totalCost,
      createdAt: createdAt,
    );
  }
}

/// UI bucket for the 3-tab filter on the lab results screen.
enum LabTestGroup { all, pending, completed }

extension LabTestGrouping on LabTestGroup {
  bool includes(LabTest t) {
    switch (this) {
      case LabTestGroup.all:
        return true;
      case LabTestGroup.pending:
        return t.status != 'completed';
      case LabTestGroup.completed:
        return t.status == 'completed';
    }
  }
}
