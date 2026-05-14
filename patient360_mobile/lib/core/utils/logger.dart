import 'package:logger/logger.dart';

/// App-wide [Logger] singleton. Prefer this over `print` for all logging.
final Logger appLogger = Logger(
  filter: ProductionFilter(),
  printer: PrettyPrinter(
    colors: false,
    printEmojis: false,
    methodCount: 0,
    errorMethodCount: 5,
    lineLength: 100,
  ),
);
