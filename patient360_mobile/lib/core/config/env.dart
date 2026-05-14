import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Strongly-typed accessors for environment variables loaded from `.env`.
///
/// Call [Env.load] from `main()` before [runApp]. Accessing a key that has
/// not been set falls back to the provided default (or empty string).
final class Env {
  const Env._();

  static Future<void> load() => dotenv.load();

  static String get apiBaseUrl =>
      dotenv.maybeGet('API_BASE_URL') ?? 'http://localhost:5000/api';

  static String read(String key, {String fallback = ''}) =>
      dotenv.maybeGet(key) ?? fallback;
}
