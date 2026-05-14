import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';
import '../domain/review.dart';
import 'providers/reviews_provider.dart';
import 'review_submit_sheet.dart';
import 'widgets/review_card.dart';

class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  Future<void> _openSubmitSheet(BuildContext context) async {
    await ReviewSubmitSheet.show(context);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Review>> async = ref.watch(reviewsProvider);
    final int unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: PageHeader(
        title: 'التقييمات',
        subtitle: 'تقييم الأطباء والمختبرات والصيدليات',
        unreadCount: unread,
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openSubmitSheet(context),
        backgroundColor: AppColors.action,
        foregroundColor: Colors.white,
        icon: const Icon(LucideIcons.plus, size: 20),
        label: const Text('إضافة تقييم',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: async.when(
        loading: () =>
            const LoadingSpinner(message: 'جاري تحميل التقييمات...'),
        error: (Object err, _) => _ErrorView(
          error: err,
          onRetry: () => ref.read(reviewsProvider.notifier).refresh(),
        ),
        data: (List<Review> list) {
          if (list.isEmpty) {
            return Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(24),
                child: EmptyState(
                  icon: LucideIcons.star,
                  title: 'لا توجد تقييمات',
                  subtitle:
                      'شاركنا تجربتك مع الأطباء والمختبرات والصيدليات.',
                  ctaLabel: 'إضافة أول تقييم',
                  onCta: () => _openSubmitSheet(context),
                ),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.read(reviewsProvider.notifier).refresh(),
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
              itemCount: list.length,
              itemBuilder: (BuildContext _, int i) =>
                  ReviewCard(review: list[i]),
            ),
          );
        },
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error, required this.onRetry});
  final Object error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    final String msg = error is ApiException
        ? (error as ApiException).toDisplayMessage()
        : error.toString();
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            EmptyState(
              icon: LucideIcons.circleAlert,
              title: 'تعذر تحميل التقييمات',
              subtitle: msg,
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 200,
              child: PrimaryButton(
                label: 'إعادة المحاولة',
                fullWidth: false,
                onPressed: () => onRetry(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
