// ════════════════════════════════════════════════════════════════════════════
//  LabResultDetailScreen
//  ──────────────────────────────────────────────────────────────────────────
//  Full-page detail view for a single lab test order/result.
//  Route: `/lab-results/:id`
//
//  Data sources (in priority order):
//    1. `extra` param passed by `context.push` from the list screen —
//       instant render, no network round-trip
//    2. Re-fetch from the provider's cached list when arriving via deep
//       link (notification tap, etc.) — looks up by id
//    3. Refresh from network if the id is unknown
//
//  Auto-marks the test as viewed when opened (mirrors the web's
//  `markLabAsViewedOnOpen`).
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/primary_button.dart';
import '../domain/lab_test.dart';
import 'providers/lab_tests_provider.dart';
import 'widgets/lab_critical_banner.dart';
import 'widgets/lab_detail_hero.dart';
import 'widgets/lab_info_section.dart';
import 'widgets/lab_note_card.dart';
import 'widgets/lab_pdf_section.dart';
import 'widgets/lab_results_section.dart';
import 'widgets/lab_tests_ordered_section.dart';

class LabResultDetailScreen extends ConsumerStatefulWidget {
  const LabResultDetailScreen({
    super.key,
    required this.testId,
    this.initialTest,
  });

  final String testId;

  /// Optional pre-loaded test passed via `context.push`'s `extra` argument.
  /// When provided, we skip the loading state entirely.
  final LabTest? initialTest;

  @override
  ConsumerState<LabResultDetailScreen> createState() =>
      _LabResultDetailScreenState();
}

class _LabResultDetailScreenState extends ConsumerState<LabResultDetailScreen> {
  bool _viewedSent = false;

  @override
  void initState() {
    super.initState();
    // Mark-as-viewed runs once after first frame so the build cycle and
    // the optimistic state update don't fight over the same tick.
    WidgetsBinding.instance.addPostFrameCallback((_) => _maybeMarkViewed());
  }

  void _maybeMarkViewed() {
    if (_viewedSent || !mounted) return;
    final LabTest? test = _resolveTest();
    if (test == null) return;
    if (test.status != 'completed' || test.isViewedByPatient) return;
    _viewedSent = true;
    // ignore: unawaited_futures
    ref.read(labTestsProvider.notifier).markViewed(test.id);
  }

  LabTest? _resolveTest() {
    // 1. Cached list takes priority — it reflects the latest mark-viewed
    // state after `markViewed` updates the provider.
    final AsyncValue<List<LabTest>> async = ref.read(labTestsProvider);
    final List<LabTest>? all = async.value;
    if (all != null) {
      for (final LabTest t in all) {
        if (t.id == widget.testId) return t;
      }
    }
    // 2. Fall back to the snapshot passed via `extra`.
    return widget.initialTest;
  }

  void _handleBack() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/lab');
    }
  }

  // ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Re-check on every rebuild so the moment the provider list arrives,
    // the page updates from `extra` → cached state seamlessly.
    final AsyncValue<List<LabTest>> async = ref.watch(labTestsProvider);
    final LabTest? test = _resolveTest();

    // First arrival via deep link with no list yet: show spinner.
    if (test == null && async.isLoading) {
      return _DetailScaffold(
        onBack: _handleBack,
        body: const LoadingSpinner(message: 'جاري تحميل تفاصيل التحليل...'),
      );
    }

    // List failed and we have no extra: error.
    if (test == null && async.hasError) {
      return _DetailScaffold(
        onBack: _handleBack,
        body: _ErrorView(
          error: async.error!,
          onRetry: () => ref.read(labTestsProvider.notifier).refresh(),
        ),
      );
    }

    // Loaded but the id doesn't exist in this patient's records.
    if (test == null) {
      return _DetailScaffold(
        onBack: _handleBack,
        body: _NotFoundView(onBack: _handleBack),
      );
    }

    // We have a test — re-attempt mark-as-viewed if not yet sent.
    if (!_viewedSent) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _maybeMarkViewed());
    }

    return _DetailScaffold(
      onBack: _handleBack,
      body: _DetailBody(test: test),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Detail page chrome — top bar + scrollable body
// ════════════════════════════════════════════════════════════════════════════

class _DetailScaffold extends StatelessWidget {
  const _DetailScaffold({required this.onBack, required this.body});

  final VoidCallback onBack;
  final Widget body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: _DetailTopBar(onBack: onBack),
      ),
      body: SafeArea(child: body),
    );
  }
}

class _DetailTopBar extends StatelessWidget {
  const _DetailTopBar({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
      elevation: 0,
      child: Container(
        decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.border, width: 1)),
        ),
        child: SafeArea(
          bottom: false,
          child: SizedBox(
            height: 56,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: Row(
                children: <Widget>[
                  Material(
                    color: AppColors.surface,
                    borderRadius: AppRadii.radiusMd,
                    child: InkWell(
                      borderRadius: AppRadii.radiusMd,
                      onTap: onBack,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 8,
                        ),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            Icon(
                              LucideIcons.arrowRight,
                              size: 16,
                              color: AppColors.action,
                            ),
                            SizedBox(width: 6),
                            Text(
                              'رجوع',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.action,
                                fontFamily: 'Cairo',
                                height: 1.0,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const Spacer(),
                  const Text(
                    'تفاصيل التحليل',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      fontFamily: 'Cairo',
                    ),
                  ),
                  const Spacer(),
                  // Right-side spacer to balance the back button visually
                  const SizedBox(width: 56),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Detail body — composes every section
// ════════════════════════════════════════════════════════════════════════════

class _DetailBody extends StatelessWidget {
  const _DetailBody({required this.test});

  final LabTest test;

  @override
  Widget build(BuildContext context) {
    final int critical = test.criticalCount;
    final int abnormal = test.abnormalCount;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        // ── Hero ─────────────────────────────────────────────────────
        LabDetailHero(
          testNumber: test.testNumber,
          orderDate: test.orderDate,
          status: test.status,
          criticalCount: critical,
          abnormalCount: abnormal,
          // doctorName + laboratoryName aren't denormalized in the mobile
          // model right now — passing null keeps those rows hidden.
        ),

        // ── Critical banner (only when critical results exist) ───────
        if (critical > 0) LabCriticalBanner(criticalCount: critical),

        // ── Lab info card ────────────────────────────────────────────
        LabInfoSection(test: test),

        // ── Tests ordered ────────────────────────────────────────────
        if (test.testsOrdered.isNotEmpty)
          LabTestsOrderedSection(tests: test.testsOrdered),

        // ── Results section (or "no results yet" message) ────────────
        LabResultsSection(results: test.testResults, status: test.status),

        // ── PDF download ─────────────────────────────────────────────
        if (test.resultPdfUrl != null && test.resultPdfUrl!.isNotEmpty)
          LabPdfSection(relativeUrl: test.resultPdfUrl!),

        // ── Lab notes ────────────────────────────────────────────────
        if (test.labNotes != null && test.labNotes!.trim().isNotEmpty)
          LabNoteCard(
            title: 'ملاحظات المختبر',
            body: test.labNotes!,
            icon: LucideIcons.fileText,
          ),

        // ── Rejection reason ─────────────────────────────────────────
        if (test.status == 'rejected' &&
            test.rejectionReason != null &&
            test.rejectionReason!.trim().isNotEmpty)
          LabNoteCard(
            title: 'سبب الرفض',
            body: test.rejectionReason!,
            icon: LucideIcons.circleAlert,
            danger: true,
          ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Error + not-found states
// ════════════════════════════════════════════════════════════════════════════

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
              title: 'تعذر تحميل التحليل',
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

class _NotFoundView extends StatelessWidget {
  const _NotFoundView({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const EmptyState(
              icon: LucideIcons.flaskConical,
              title: 'التحليل غير موجود',
              subtitle: 'قد يكون التحليل قد أُزيل أو لم يعد متاحاً.',
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 240,
              child: PrimaryButton(
                label: 'العودة إلى نتائج المختبر',
                fullWidth: false,
                onPressed: onBack,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
