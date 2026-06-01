import 'package:flutter/foundation.dart';

/// One entry in `lab_tests.testsOrdered[]`. The doctor enumerates these
/// when ordering a panel; results land separately in `testResults[]` once
/// the lab finishes the analysis.
@immutable
class TestOrdered {
  const TestOrdered({
    required this.testCode,
    required this.testName,
    this.notes,
  });

  factory TestOrdered.fromJson(Map<String, dynamic> json) {
    return TestOrdered(
      testCode: (json['testCode'] as String?) ?? '',
      testName: (json['testName'] as String?) ?? '',
      notes: json['notes'] as String?,
    );
  }

  final String testCode;
  final String testName;
  final String? notes;
}
