// ════════════════════════════════════════════════════════════════════════════
//  VisitsScreen
//  ──────────────────────────────────────────────────────────────────────────
//  Lists the patient's visits as compact cards. Tapping a card pushes the
//  full detail page (`/visits/:id`). The previous "rail + expandable card"
//  layout was scrapped because `IntrinsicHeight` cannot wrap a child whose
//  intrinsic dimensions are unknown (e.g. anything that internally uses
//  LayoutBuilder), which crashed the page on expand.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/visit.dart';
import 'providers/visits_provider.dart';
import 'widgets/visit_status_chip.dart';

class VisitsScreen extends ConsumerWidget {
  const VisitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Visit>> async = ref.watch(visitsProvider);
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: PageHeader(
        title: 'الزيارات الطبية',
        subtitle: 'سجل الزيارات والفحوصات السابقة',
        unreadCount: unread,
      ),
      body: async.when(
        loading: () => const LoadingSpinner(message: 'جاري تحميل الزيارات...'),
        error: (Object err, _) {
          final String msg = err is ApiException
              ? err.toDisplayMessage()
              : err.toString();
          return Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  EmptyState(
                    icon: LucideIcons.circleAlert,
                    title: 'تعذر تحميل الزيارات',
                    subtitle: msg,
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: 200,
                    child: PrimaryButton(
                      label: 'إعادة المحاولة',
                      fullWidth: false,
                      onPressed: () =>
                          ref.read(visitsProvider.notifier).refresh(),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
        data: (List<Visit> list) {
          if (list.isEmpty) {
            return const Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  icon: LucideIcons.stethoscope,
                  title: 'لا توجد زيارات مسجلة',
                  subtitle:
                      'ستظهر هنا زياراتك الطبية بعد تسجيلها من قبل الطبيب.',
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(visitsProvider.notifier).refresh(),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              itemCount: list.length,
              itemBuilder: (BuildContext _, int i) =>
                  _VisitTile(visit: list[i]),
            ),
          );
        },
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Single visit row — tappable card
// ════════════════════════════════════════════════════════════════════════════

class _VisitTile extends StatelessWidget {
  const _VisitTile({required this.visit});
  final Visit visit;

  void _openDetail(BuildContext context) {
    context.push('/visits/${visit.id}', extra: visit);
  }

  @override
  Widget build(BuildContext context) {
    final String title = visit.chiefComplaint.trim().isNotEmpty
        ? visit.chiefComplaint.trim()
        : 'زيارة طبية';

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: AppColors.card,
        borderRadius: AppRadii.radiusLg,
        child: InkWell(
          borderRadius: AppRadii.radiusLg,
          onTap: () => _openDetail(context),
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: AppRadii.radiusLg,
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Container(
                  width: 44,
                  height: 44,
                  decoration: const BoxDecoration(
                    color: AppColors.surface,
                    borderRadius: BorderRadius.all(Radius.circular(12)),
                  ),
                  alignment: Alignment.center,
                  child: const Icon(
                    LucideIcons.stethoscope,
                    size: 22,
                    color: AppColors.action,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w800,
                          color: AppColors.primary,
                          fontFamily: 'Cairo',
                          height: 1.3,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: <Widget>[
                          const Icon(
                            LucideIcons.calendar,
                            size: 12,
                            color: AppColors.textSecondary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            _formatDate(visit.visitDate),
                            textDirection: TextDirection.ltr,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.textSecondary,
                              fontFamily: 'Inter',
                              height: 1.0,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: <Widget>[
                          VisitStatusChip(status: visit.status),
                          VisitTypeChip(visitType: visit.visitType),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                const Icon(
                  LucideIcons.chevronLeft,
                  size: 18,
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime d) {
    try {
      return intl.DateFormat('yyyy-MM-dd').format(d);
    } catch (_) {
      return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    }
  }
}
