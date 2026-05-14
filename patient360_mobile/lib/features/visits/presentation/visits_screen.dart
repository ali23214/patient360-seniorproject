import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/visit.dart';
import 'providers/visits_provider.dart';
import 'widgets/visit_card.dart';

class VisitsScreen extends ConsumerWidget {
  const VisitsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Visit>> async = ref.watch(visitsProvider);
    final int unread = ref
            .watch(dashboardOverviewProvider)
            .value
            ?.unreadNotifications ??
        0;

    return Scaffold(
      appBar: PageHeader(
        title: 'الزيارات الطبية',
        subtitle: 'سجل الزيارات والفحوصات السابقة',
        unreadCount: unread,
      ),
      body: async.when(
        loading: () =>
            const LoadingSpinner(message: 'جاري تحميل الزيارات...'),
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
                  icon: LucideIcons.fileText,
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
              itemBuilder: (BuildContext _, int i) => _TimelineRow(
                visit: list[i],
                isFirst: i == 0,
                isLast: i == list.length - 1,
              ),
            ),
          );
        },
      ),
    );
  }
}

/// One row in the vertical timeline: a fixed-width rail (dot + connector
/// line) on the start side, the [VisitCard] expanding to fill the rest.
class _TimelineRow extends StatelessWidget {
  const _TimelineRow({
    required this.visit,
    required this.isFirst,
    required this.isLast,
  });

  final Visit visit;
  final bool isFirst;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          SizedBox(
            width: 28,
            child: CustomPaint(
              painter: _RailPainter(
                isFirst: isFirst,
                isLast: isLast,
                lineColor: Theme.of(context).colorScheme.outline,
                dotColor: AppColors.action,
              ),
            ),
          ),
          const SizedBox(width: 4),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: VisitCard(visit: visit),
            ),
          ),
        ],
      ),
    );
  }
}

class _RailPainter extends CustomPainter {
  _RailPainter({
    required this.isFirst,
    required this.isLast,
    required this.lineColor,
    required this.dotColor,
  });

  final bool isFirst;
  final bool isLast;
  final Color lineColor;
  final Color dotColor;

  @override
  void paint(Canvas canvas, Size size) {
    final double cx = size.width / 2;
    const double dotY = 26;
    const double dotRadius = 6;

    final Paint linePaint = Paint()
      ..color = lineColor
      ..strokeWidth = 2;

    // Above the dot — skipped on the first row.
    if (!isFirst) {
      canvas.drawLine(Offset(cx, 0), Offset(cx, dotY - dotRadius), linePaint);
    }
    // Below the dot — skipped on the last row.
    if (!isLast) {
      canvas.drawLine(
        Offset(cx, dotY + dotRadius),
        Offset(cx, size.height),
        linePaint,
      );
    }

    final Paint dotPaint = Paint()..color = dotColor;
    canvas.drawCircle(Offset(cx, dotY), dotRadius, dotPaint);
    final Paint dotRing = Paint()
      ..color = dotColor.withValues(alpha: 0.25)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4;
    canvas.drawCircle(Offset(cx, dotY), dotRadius + 2, dotRing);
  }

  @override
  bool shouldRepaint(covariant _RailPainter old) =>
      old.isFirst != isFirst ||
      old.isLast != isLast ||
      old.lineColor != lineColor ||
      old.dotColor != dotColor;
}
