// ════════════════════════════════════════════════════════════════════════════
//  Visit chips: status (in_progress / completed / cancelled) and visit
//  type (regular / follow_up / emergency / consultation / dental / lab_only).
//  Same visual language as the lab + prescription chips.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

class VisitStatusChip extends StatelessWidget {
  const VisitStatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final _ChipStyle s = _styleFor(status);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: s.bg,
        border: Border.all(color: s.border),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(s.icon, size: 12, color: s.fg),
          const SizedBox(width: 5),
          Text(
            s.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: s.fg,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  static _ChipStyle _styleFor(String s) {
    switch (s) {
      case 'completed':
        return const _ChipStyle(
          label: 'مكتملة',
          bg: Color(0xFFE8F5E9),
          fg: Color(0xFF2E7D32),
          border: Color(0xFFC8E6C9),
          icon: LucideIcons.circleCheckBig,
        );
      case 'in_progress':
        return const _ChipStyle(
          label: 'جارية',
          bg: Color(0xFFE3F2FD),
          fg: Color(0xFF1565C0),
          border: Color(0xFFBBDEFB),
          icon: LucideIcons.clock,
        );
      case 'cancelled':
        return const _ChipStyle(
          label: 'ملغاة',
          bg: Color(0xFFFFEBEE),
          fg: Color(0xFFC62828),
          border: Color(0xFFFFCDD2),
          icon: LucideIcons.circleX,
        );
      default:
        return _ChipStyle(
          label: s,
          bg: const Color(0xFFECEFF1),
          fg: const Color(0xFF455A64),
          border: const Color(0xFFCFD8DC),
          icon: LucideIcons.info,
        );
    }
  }
}

class VisitTypeChip extends StatelessWidget {
  const VisitTypeChip({super.key, required this.visitType});

  final String visitType;

  @override
  Widget build(BuildContext context) {
    final _ChipStyle s = _styleFor(visitType);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: s.bg,
        border: Border.all(color: s.border),
        borderRadius: const BorderRadius.all(Radius.circular(999)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(s.icon, size: 12, color: s.fg),
          const SizedBox(width: 5),
          Text(
            s.label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: s.fg,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  static _ChipStyle _styleFor(String t) {
    switch (t) {
      case 'regular':
        return const _ChipStyle(
          label: 'زيارة عادية',
          bg: Color(0xFFE0F2F1),
          fg: Color(0xFF00695C),
          border: Color(0xFFB2DFDB),
          icon: LucideIcons.stethoscope,
        );
      case 'follow_up':
        return const _ChipStyle(
          label: 'متابعة',
          bg: Color(0xFFE3F2FD),
          fg: Color(0xFF1565C0),
          border: Color(0xFFBBDEFB),
          icon: LucideIcons.refreshCw,
        );
      case 'emergency':
        return const _ChipStyle(
          label: 'طارئة',
          bg: Color(0xFFFFEBEE),
          fg: Color(0xFFC62828),
          border: Color(0xFFFFCDD2),
          icon: LucideIcons.triangleAlert,
        );
      case 'consultation':
        return const _ChipStyle(
          label: 'استشارة',
          bg: Color(0xFFF3E5F5),
          fg: Color(0xFF6A1B9A),
          border: Color(0xFFE1BEE7),
          icon: LucideIcons.messageSquare,
        );
      case 'dental':
        return const _ChipStyle(
          label: 'أسنان',
          bg: Color(0xFFE8F5E9),
          fg: Color(0xFF2E7D32),
          border: Color(0xFFC8E6C9),
          icon: LucideIcons.smile,
        );
      case 'lab_only':
        return const _ChipStyle(
          label: 'مختبر فقط',
          bg: Color(0xFFFFF3E0),
          fg: Color(0xFFE65100),
          border: Color(0xFFFFE0B2),
          icon: LucideIcons.flaskConical,
        );
      default:
        return _ChipStyle(
          label: t,
          bg: const Color(0xFFECEFF1),
          fg: const Color(0xFF455A64),
          border: const Color(0xFFCFD8DC),
          icon: LucideIcons.info,
        );
    }
  }
}

class _ChipStyle {
  const _ChipStyle({
    required this.label,
    required this.bg,
    required this.fg,
    required this.border,
    required this.icon,
  });
  final String label;
  final Color bg;
  final Color fg;
  final Color border;
  final IconData icon;
}
