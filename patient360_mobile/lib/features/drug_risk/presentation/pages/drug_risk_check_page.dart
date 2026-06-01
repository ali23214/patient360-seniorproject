// ============================================================================
// DrugRiskCheckPage - Patient 360 mobile (drug-risk feature)
// ----------------------------------------------------------------------------
// The full "فحص دواء" screen. Layout (top to bottom):
//
//   1. Header card        : feature explanation + ShieldCheck icon
//   2. DrugCheckInput     : textarea + counter + submit/clear buttons
//   3. Result area        :
//        - while idle      -> empty state ("اكتب دواء للبدء")
//        - while loading   -> shimmer placeholder
//        - on success      -> DrugCheckResultCard
//        - on error        -> error card with retry CTA
//   4. History section    :
//        - if empty        -> empty state ("لم تقم بأي فحص بعد")
//        - otherwise       -> DrugCheckHistoryList (last 20)
//
// Pull-to-refresh on the whole page re-fetches the history.
// ============================================================================

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../../core/network/api_exception.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';
import '../../domain/drug_risk_check.dart';
import '../providers/drug_risk_providers.dart';
import '../widgets/drug_check_history_list.dart';
import '../widgets/drug_check_input.dart';
import '../widgets/drug_check_result_card.dart';
import '../widgets/drug_risk_empty_state.dart';

class DrugRiskCheckPage extends ConsumerWidget {
  const DrugRiskCheckPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<DrugRiskCheck?> checkState = ref.watch(
      drugCheckControllerProvider,
    );
    final AsyncValue<List<DrugRiskCheck>> historyState = ref.watch(
      drugRiskHistoryProvider,
    );
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Scaffold(
      backgroundColor: scheme.surfaceContainerLowest,
      body: SafeArea(
        child: RefreshIndicator(
          color: AppColors.action,
          onRefresh: () => ref.read(drugRiskHistoryProvider.notifier).refresh(),
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                // -- 1. Header --
                const _HeaderCard(),
                const SizedBox(height: 14),

                // -- 2. Input --
                DrugCheckInput(
                  isLoading: checkState.isLoading,
                  onSubmit: (String text) {
                    // ignore: discarded_futures
                    ref.read(drugCheckControllerProvider.notifier).submit(text);
                  },
                  onClear: () {
                    ref.read(drugCheckControllerProvider.notifier).clear();
                  },
                ),
                const SizedBox(height: 14),

                // -- 3. Result area --
                _ResultArea(state: checkState),
                const SizedBox(height: 18),

                // -- 4. History section --
                _HistoryArea(state: historyState),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ============================================================================
// Header card — feature explanation
// ============================================================================

class _HeaderCard extends StatelessWidget {
  const _HeaderCard();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
      decoration: BoxDecoration(
        color: AppColors.action.withValues(alpha: 0.08),
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.action.withValues(alpha: 0.25)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.action.withValues(alpha: 0.18),
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.shieldCheck,
              size: 20,
              color: AppColors.action,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'فحص أمان الدواء قبل الاستخدام',
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'اكتب اسم الدواء أو جملة عنه، وسنقارنه تلقائياً مع '
                  'حساسياتك وأدويتك الحالية المسجلة في ملفك الطبي.',
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12.5,
                    height: 1.7,
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
}

// ============================================================================
// Result area — idle / loading / data / error
// ============================================================================

class _ResultArea extends StatelessWidget {
  const _ResultArea({required this.state});
  final AsyncValue<DrugRiskCheck?> state;

  @override
  Widget build(BuildContext context) {
    return state.when(
      data: (DrugRiskCheck? check) {
        if (check == null) {
          return const DrugRiskEmptyState(
            icon: LucideIcons.sparkles,
            title: 'جاهز لفحص دوائك',
            subtitle:
                'اكتب اسم الدواء أعلاه واضغط "فحص الدواء" '
                'لتقييم أمانه بناءً على ملفك الطبي.',
          );
        }
        return DrugCheckResultCard(check: check);
      },
      loading: () => const _LoadingPlaceholder(),
      error: (Object err, StackTrace _) => _ErrorCard(error: err),
    );
  }
}

// ============================================================================
// Loading placeholder
// ============================================================================

class _LoadingPlaceholder extends StatelessWidget {
  const _LoadingPlaceholder();

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 36),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline.withValues(alpha: 0.5)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          const SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2.4,
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.action),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'جارٍ فحص الدواء...',
            style: TextStyle(
              color: scheme.onSurfaceVariant,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFamily: 'Cairo',
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================================
// Error card — when the submit fails
// ============================================================================

class _ErrorCard extends StatelessWidget {
  const _ErrorCard({required this.error});
  final Object error;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    String message;
    if (error is ApiException) {
      message = error.toString();
    } else {
      message = 'تعذّر إتمام فحص الدواء. حاول مرة أخرى.';
    }

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.error.withValues(alpha: 0.06),
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: AppColors.error.withValues(alpha: 0.35)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(LucideIcons.circleAlert, size: 20, color: AppColors.error),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  'حدث خطأ',
                  style: TextStyle(
                    color: AppColors.error,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  message,
                  style: TextStyle(
                    color: scheme.onSurface,
                    fontSize: 12.5,
                    height: 1.6,
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
}

// ============================================================================
// History area
// ============================================================================

class _HistoryArea extends StatelessWidget {
  const _HistoryArea({required this.state});
  final AsyncValue<List<DrugRiskCheck>> state;

  @override
  Widget build(BuildContext context) {
    return state.when(
      data: (List<DrugRiskCheck> checks) {
        if (checks.isEmpty) {
          return const DrugRiskEmptyState(
            icon: LucideIcons.history,
            title: 'لا توجد فحوصات سابقة',
            subtitle:
                'بمجرد إجراء أول فحص، سيظهر هنا تاريخ فحوصاتك '
                'مع نتائجها كاملة.',
          );
        }
        return DrugCheckHistoryList(checks: checks);
      },
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2.2,
              valueColor: AlwaysStoppedAnimation<Color>(AppColors.action),
            ),
          ),
        ),
      ),
      // History errors are silent — the user already saw the main error;
      // showing it twice would be noisy.
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}
