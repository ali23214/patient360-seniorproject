// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionListCard
//  ──────────────────────────────────────────────────────────────────────────
//  One card in the prescriptions list. Mirrors the web's `.pdmr-card`
//  pattern from PatientDashboard.jsx.
//
//  Visual layout:
//
//    ┌────────────────────────────────────────────────────────────┐
//    │ 💊  RX-20260516-48392             [نشطة]                   │
//    │     [📅 16 أيار 2026] [💊 1 دواء]                          │
//    │                                                       [〉]│
//    └────────────────────────────────────────────────────────────┘
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/prescription.dart';
import 'prescription_status_chip.dart';

class PrescriptionListCard extends StatelessWidget {
  const PrescriptionListCard({
    super.key,
    required this.prescription,
    required this.onTap,
  });

  final Prescription prescription;
  final ValueChanged<Prescription> onTap;

  @override
  Widget build(BuildContext context) {
    final int medsCount = prescription.medications.length;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        child: InkWell(
          borderRadius: AppRadii.radiusLg,
          onTap: () => onTap(prescription),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: AppRadii.radiusLg,
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // ── Leading icon bubble ─────────────────────────────
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.all(Radius.circular(10)),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.pill,
                    size: 22,
                    color: AppColors.action,
                  ),
                ),
                const SizedBox(width: 12),

                // ── Body ────────────────────────────────────────────
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Expanded(
                            child: Text(
                              prescription.prescriptionNumber.isNotEmpty
                                  ? prescription.prescriptionNumber
                                  : 'وصفة طبية',
                              textDirection: TextDirection.ltr,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: AppColors.primary,
                                fontFamily: 'Inter',
                                height: 1.2,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          PrescriptionStatusChip(
                            status: prescription.status,
                            compact: true,
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),

                      // Meta chips row
                      Wrap(
                        spacing: 12,
                        runSpacing: 6,
                        children: <Widget>[
                          _MetaItem(
                            icon: LucideIcons.calendar,
                            text: _formatDate(prescription.prescriptionDate),
                            direction: TextDirection.ltr,
                          ),
                          if (medsCount > 0)
                            _MetaItem(
                              icon: LucideIcons.pill,
                              text: medsCount == 1
                                  ? 'دواء واحد'
                                  : '$medsCount أدوية',
                            ),
                          if (prescription.expiryDate != null &&
                              _isExpiringSoon(prescription.expiryDate!) &&
                              prescription.isActive)
                            const _BadgeItem(
                              icon: LucideIcons.clock,
                              text: 'تنتهي قريباً',
                              bg: Color(0xFFFFF8E1),
                              fg: Color(0xFFF57C00),
                              borderColor: Color(0xFFFFE082),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(width: 8),
                const Padding(
                  padding: EdgeInsets.only(top: 14),
                  child: Icon(
                    LucideIcons.chevronLeft,
                    size: 18,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime date) {
    try {
      return intl.DateFormat('d MMM yyyy', 'ar').format(date);
    } catch (_) {
      return '${date.day}/${date.month}/${date.year}';
    }
  }

  /// "expiring soon" = within 7 days from today (Active prescriptions only).
  static bool _isExpiringSoon(DateTime expiry) {
    final DateTime now = DateTime.now();
    final Duration delta = expiry.difference(now);
    return delta.inDays >= 0 && delta.inDays <= 7;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Meta item: icon + text
// ────────────────────────────────────────────────────────────────────────────

class _MetaItem extends StatelessWidget {
  const _MetaItem({required this.icon, required this.text, this.direction});

  final IconData icon;
  final String text;
  final TextDirection? direction;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 13, color: AppColors.textSecondary),
        const SizedBox(width: 4),
        Text(
          text,
          textDirection: direction,
          style: const TextStyle(
            fontSize: 12,
            color: AppColors.textSecondary,
            fontFamily: 'Cairo',
            height: 1.2,
          ),
        ),
      ],
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Colored badge
// ────────────────────────────────────────────────────────────────────────────

class _BadgeItem extends StatelessWidget {
  const _BadgeItem({
    required this.icon,
    required this.text,
    required this.bg,
    required this.fg,
    required this.borderColor,
  });

  final IconData icon;
  final String text;
  final Color bg;
  final Color fg;
  final Color borderColor;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: const BorderRadius.all(Radius.circular(999)),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: fg,
              fontFamily: 'Cairo',
              height: 1.0,
            ),
          ),
        ],
      ),
    );
  }
}
