import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Storage keys used by the auth flow. Centralized so callers don't typo keys.
final class SecureStorageKeys {
  const SecureStorageKeys._();

  static const String jwt = 'p360.jwt';
  static const String user = 'p360.user';
}

/// Thin wrapper over [FlutterSecureStorage] that survives in tests via overrides.
class SecureStorage {
  SecureStorage(this._storage);

  final FlutterSecureStorage _storage;

  Future<String?> read(String key) => _storage.read(key: key);

  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  Future<void> delete(String key) => _storage.delete(key: key);

  Future<void> clearAuth() async {
    await _storage.delete(key: SecureStorageKeys.jwt);
    await _storage.delete(key: SecureStorageKeys.user);
  }
}

final Provider<SecureStorage> secureStorageProvider = Provider<SecureStorage>(
  (Ref ref) => SecureStorage(const FlutterSecureStorage()),
);
