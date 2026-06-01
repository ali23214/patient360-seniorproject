import 'package:flutter_test/flutter_test.dart';

import 'package:patient360_mobile/features/ai_assistant/presentation/widgets/input_image.dart';

void main() {
  const ImageValidator validator = ImageValidator();

  test('rejects files larger than 10 MB', () {
    final ImageValidationResult r = validator.validate(
      path: '/tmp/photo.jpg',
      sizeBytes: 11 * 1024 * 1024,
    );
    expect(r.isValid, isFalse);
    expect(r.rejectionReason, contains('10'));
  });

  test('accepts files at exactly the 10 MB boundary', () {
    final ImageValidationResult r = validator.validate(
      path: '/tmp/photo.jpg',
      sizeBytes: 10 * 1024 * 1024,
    );
    expect(r.isValid, isTrue);
  });

  test('rejects unsupported MIME by extension (gif)', () {
    final ImageValidationResult r = validator.validate(
      path: '/tmp/photo.gif',
      sizeBytes: 200 * 1024,
    );
    expect(r.isValid, isFalse);
    expect(r.rejectionReason, contains('JPG'));
  });

  test('accepts jpg/jpeg/png/webp regardless of case', () {
    for (final String ext in <String>['jpg', 'JPEG', 'png', 'WeBp']) {
      final ImageValidationResult r = validator.validate(
        path: '/tmp/photo.$ext',
        sizeBytes: 500 * 1024,
      );
      expect(r.isValid, isTrue,
          reason: 'expected .$ext to be accepted');
    }
  });

  test('rejects files with no extension', () {
    final ImageValidationResult r = validator.validate(
      path: '/tmp/scan',
      sizeBytes: 500 * 1024,
    );
    expect(r.isValid, isFalse);
  });
}
