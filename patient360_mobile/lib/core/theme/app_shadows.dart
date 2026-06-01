import 'package:flutter/widgets.dart';

/// Elevation shadow tokens mirroring --pd-shadow-* CSS variables (Part C.3).
///
/// Hex alpha values correspond exactly to the CSS rgba opacities:
///   0.06 → 0x0F, 0.08 → 0x14, 0.12 → 0x1F.
final class AppShadows {
  const AppShadows._();

  static const List<BoxShadow> sm = <BoxShadow>[
    BoxShadow(
      color: Color(0x0F0D3B3E),
      offset: Offset(0, 1),
      blurRadius: 2,
    ),
  ];

  static const List<BoxShadow> md = <BoxShadow>[
    BoxShadow(
      color: Color(0x140D3B3E),
      offset: Offset(0, 4),
      blurRadius: 12,
    ),
  ];

  static const List<BoxShadow> lg = <BoxShadow>[
    BoxShadow(
      color: Color(0x1F0D3B3E),
      offset: Offset(0, 8),
      blurRadius: 28,
    ),
  ];
}
