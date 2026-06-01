// ============================================================================
// DrugCheckResultCard - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// The big result panel shown after a successful check. Four visual variants
// driven by RiskLevel:
//
//   RiskLevel.high    -> red    border + AlertOctagon icon
//   RiskLevel.medium  -> amber  border + AlertTriangle icon
//   RiskLevel.low     -> green  border + CircleCheck icon
//   RiskLevel.unknown -> teal   border + Info icon
//
// Sections rendered conditionally (each only shows if its field is non-null):
//   * Header (always)        : icon + risk label + drug name + timestamp
//   * Reason   (reasonAr)    : neutral background
//   * Advice   (adviceAr)    : neutral background
//   * Warning  (warningAr)   : amber background (escalates attention)
//   * Interaction (interactionWarningAr) : indigo background (drug-drug)
//   * Disclaimer footer      : always shown — "this is not medical advice"
//
// Mirrors the web atom .pd-dr-result-card in PatientDashboard.jsx.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/drug_risk_check.dart';
import '../../domain/risk_level.dart';

class DrugCheckResultCard extends StatelessWidget {
  const DrugCheckResultCard({required this.check, super.key});

  final DrugRiskCheck check;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final RiskLevel level = check.result.riskLevel;
    final Color tone = level.color;
    final bool urgent = level.isUrgent;

    return Container(
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(
          color: tone.withValues(alpha: urgent ? 0.6 : 0.35),
          width: urgent ? 2 : 1.5,
        ),
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: tone.withValues(alpha: 0.08),
            blurRadius: 14,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          // -- Header (colored tint) --
          _Header(check: check),

          // -- Body sections --
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                if (check.result.reasonAr != null &&
                    check.result.reasonAr!.isNotEmpty)
                  _ResultSection(
                    label: 'السبب',
                    icon: LucideIcons.info,
                    text: check.result.reasonAr!,
                  ),

                if (check.result.adviceAr != null &&
                    check.result.adviceAr!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  _ResultSection(
                    label: 'النصيحة',
                    icon: LucideIcons.stethoscope,
                    text: check.result.adviceAr!,
                  ),
                ],

                if (check.result.warningAr != null &&
                    check.result.warningAr!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  _ResultSection(
                    label: 'تحذير',
                    icon: LucideIcons.triangleAlert,
                    text: check.result.warningAr!,
                    variant: _SectionVariant.warning,
                  ),
                ],

                if (check.result.interactionWarningAr != null &&
                    check.result.interactionWarningAr!.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 10),
                  _ResultSection(
                    label: 'تفاعل دوائي',
                    icon: LucideIcons.pill,
                    text: check.result.interactionWarningAr!,
                    variant: _SectionVariant.interaction,
                  ),
                ],

                // -- Footer disclaimer --
                const SizedBox(height: 14),
                _Disclaimer(scheme: scheme),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// Header
// ============================================================================

class _Header extends StatelessWidget {
  const _Header({required this.check});
  final DrugRiskCheck check;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final RiskLevel level = check.result.riskLevel;
    final Color tone = level.color;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.10),
        borderRadius: BorderRadiusDirectional.only(
          topStart: const Radius.circular(14),
          topEnd: const Radius.circular(14),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          // Icon circle
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: Icon(level.icon, size: 20, color: tone),
          ),
          const SizedBox(width: 12),

          // Title block
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  level.arabicLabel,
                  style: TextStyle(
                    color: tone,
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 2),
                if (check.result.drugNameAr != null &&
                    check.result.drugNameAr!.isNotEmpty)
                  RichText(
                    text: TextSpan(
                      style: TextStyle(
                        color: scheme.onSurfaceVariant,
                        fontSize: 12,
                        fontFamily: 'Cairo',
                      ),
                      children: <InlineSpan>[
                        const TextSpan(text: 'الدواء: '),
                        WidgetSpan(
                          alignment: PlaceholderAlignment.middle,
                          child: Directionality(
                            textDirection: TextDirection.ltr,
                            child: Text(
                              check.result.drugNameAr!,
                              style: TextStyle(
                                color: scheme.onSurface,
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                fontFamily: 'Inter',
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 2),
                Text(
                  _formatTimestamp(check.createdAt),
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 11,
                    fontFamily: 'Cairo',
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatTimestamp(DateTime dt) {
    final DateTime local = dt.toLocal();
    final String hh = local.hour.toString().padLeft(2, '0');
    final String mm = local.minute.toString().padLeft(2, '0');
    const List<String> arabicMonths = <String>[
      'كانون الثاني',
      'شباط',
      'آذار',
      'نيسان',
      'أيار',
      'حزيران',
      'تموز',
      'آب',
      'أيلول',
      'تشرين الأول',
      'تشرين الثاني',
      'كانون الأول',
    ];
    final String month = arabicMonths[local.month - 1];
    return '${local.day} $month ${local.year} — $hh:$mm';
  }
}

// ============================================================================
// Result section (one row: reason / advice / warning / interaction)
// ============================================================================

enum _SectionVariant { neutral, warning, interaction }

class _ResultSection extends StatelessWidget {
  const _ResultSection({
    required this.label,
    required this.icon,
    required this.text,
    this.variant = _SectionVariant.neutral,
  });

  final String label;
  final IconData icon;
  final String text;
  final _SectionVariant variant;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    final Color bg;
    final Color border;
    final Color labelColor;
    switch (variant) {
      case _SectionVariant.warning:
        bg = AppColors.warning.withValues(alpha: 0.08);
        border = AppColors.warning.withValues(alpha: 0.30);
        labelColor = AppColors.warning;
        break;
      case _SectionVariant.interaction:
        bg = const Color(0xFFEEF2FF);
        border = const Color(0xFFC7D2FE);
        labelColor = const Color(0xFF3730A3);
        break;
      case _SectionVariant.neutral:
        bg = scheme.surfaceContainerHighest;
        border = scheme.outline.withValues(alpha: 0.4);
        labelColor = scheme.onSurfaceVariant;
        break;
    }

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(icon, size: 14, color: labelColor),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  color: labelColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'Cairo',
                  letterSpacing: 0.1,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            text,
            style: TextStyle(
              color: scheme.onSurface,
              fontSize: 13.5,
              height: 1.7,
              fontFamily: 'Cairo',
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// Disclaimer footer
// ============================================================================

class _Disclaimer extends StatelessWidget {
  const _Disclaimer({required this.scheme});
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Icon(LucideIcons.shieldCheck, size: 14, color: scheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            'هذه النتيجة استرشادية وتعتمد على ملفك الطبي. '
            'لا تحل محل استشارة الطبيب أو الصيدلي.',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 11,
              height: 1.6,
              fontFamily: 'Cairo',
            ),
          ),
        ),
      ],
    );
  }
}
