import 'package:flutter/foundation.dart';

/// One row inside `lab_tests.testResults[]`. The schema permits string
/// values (e.g. "POSITIVE", "TRACE") alongside numeric ones, so [value] is
/// always the canonical display string while [numericValue] carries the
/// parsed number when available.
@immutable
class TestResultRow {
  const TestResultRow({
    required this.testName,
    required this.value,
    required this.isAbnormal,
    required this.isCritical,
    this.testCode,
    this.numericValue,
    this.unit,
    this.referenceRange,
  });

  factory TestResultRow.fromJson(Map<String, dynamic> json) {
    return TestResultRow(
      testCode: json['testCode'] as String?,
      testName: (json['testName'] as String?) ?? '',
      value: (json['value']?.toString()) ?? '',
      numericValue: (json['numericValue'] as num?)?.toDouble(),
      unit: json['unit'] as String?,
      referenceRange: json['referenceRange'] as String?,
      isAbnormal: (json['isAbnormal'] as bool?) ?? false,
      isCritical: (json['isCritical'] as bool?) ?? false,
    );
  }

  final String? testCode;
  final String testName;

  /// Always populated — either the original string value or
  /// `numericValue.toString()`. Display in the table cell verbatim.
  final String value;
  final double? numericValue;
  final String? unit;
  final String? referenceRange;
  final bool isAbnormal;
  final bool isCritical;
}
