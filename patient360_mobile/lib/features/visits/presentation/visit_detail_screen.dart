// ════════════════════════════════════════════════════════════════════════════
//  VisitDetailScreen
//  ──────────────────────────────────────────────────────────────────────────
//  Full-page detail view for a single visit. Route: `/visits/:id`
//
//  Data sources:
//    1. `extra` passed by context.push (instant render — preferred)
//    2. Lookup against the cached visits list provider
//
//  All sections render conditionally so a sparse visit (e.g. just a chief
//  complaint with no vitals) doesn't leave empty card scaffolding behind.
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
import '../domain/visit.dart';
import 'photo_viewer_screen.dart';
import 'providers/visits_provider.dart';
import 'widgets/visit_detail_hero.dart';
import 'widgets/visit_info_section.dart';
import 'widgets/visit_medications_section.dart';
import 'widgets/visit_note_card.dart';
import 'widgets/visit_vitals_section.dart';

class VisitDetailScreen extends ConsumerWidget {
  const VisitDetailScreen({
    super.key,
    required this.visitId,
    this.initialVisit,
  });

  final String visitId;
  final Visit? initialVisit;

  Visit? _resolve(WidgetRef ref) {
    final AsyncValue<List<Visit>> async = ref.read(visitsProvider);
    final List<Visit>? all = async.value;
    if (all != null) {
      for (final Visit v in all) {
        if (v.id == visitId) return v;
      }
    }
    return initialVisit;
  }

  void _back(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/visits');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Visit>> async = ref.watch(visitsProvider);
    final Visit? v = _resolve(ref);

    if (v == null && async.isLoading) {
      return _Scaffold(
        onBack: () => _back(context),
        body: const LoadingSpinner(message: 'جاري تحميل تفاصيل الزيارة...'),
      );
    }

    if (v == null && async.hasError) {
      return _Scaffold(
        onBack: () => _back(context),
        body: _ErrorView(
          error: async.error!,
          onRetry: () => ref.read(visitsProvider.notifier).refresh(),
        ),
      );
    }

    if (v == null) {
      return _Scaffold(
        onBack: () => _back(context),
        body: _NotFound(onBack: () => _back(context)),
      );
    }

    return _Scaffold(
      onBack: () => _back(context),
      body: _Body(visit: v),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Scaffold chrome
// ════════════════════════════════════════════════════════════════════════════

class _Scaffold extends StatelessWidget {
  const _Scaffold({required this.onBack, required this.body});
  final VoidCallback onBack;
  final Widget body;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: PreferredSize(
        preferredSize: const Size.fromHeight(56),
        child: _TopBar(onBack: onBack),
      ),
      body: SafeArea(child: body),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: AppColors.card,
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
                    'تفاصيل الزيارة',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primary,
                      fontFamily: 'Cairo',
                    ),
                  ),
                  const Spacer(),
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
// Body — section composition
// ════════════════════════════════════════════════════════════════════════════

class _Body extends StatelessWidget {
  const _Body({required this.visit});
  final Visit visit;

  String? get _doctorName {
    final String? n = visit.doctor?.displayName;
    if (n != null && n.trim().isNotEmpty) return n.trim();
    return null;
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        VisitDetailHero(
          chiefComplaint: visit.chiefComplaint,
          visitDate: visit.visitDate,
          status: visit.status,
          visitType: visit.visitType,
          doctorName: _doctorName,
        ),
        VisitInfoSection(visit: visit, doctorName: _doctorName),
        if (visit.vitalSigns != null && visit.vitalSigns!.hasAny)
          VisitVitalsSection(vitals: visit.vitalSigns!),
        if (visit.prescribedMedications.isNotEmpty)
          VisitMedicationsSection(medications: visit.prescribedMedications),
        if (visit.ecgAnalysis != null) VisitEcgCard(ecg: visit.ecgAnalysis!),
        if ((visit.visitPhotoUrl ?? '').isNotEmpty)
          VisitPhotoCard(
            imageUrl: visit.visitPhotoUrl!,
            onOpen: () => PhotoViewerScreen.open(context, visit.visitPhotoUrl!),
          ),
        if ((visit.doctorNotes ?? '').trim().isNotEmpty)
          VisitNoteCard(
            icon: LucideIcons.fileText,
            title: 'ملاحظات الطبيب',
            body: visit.doctorNotes!,
          ),
        if ((visit.followUpNotes ?? '').trim().isNotEmpty)
          VisitNoteCard(
            icon: LucideIcons.calendarClock,
            title: 'ملاحظات المتابعة',
            body: visit.followUpNotes!,
          ),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Error + not-found
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
              title: 'تعذر تحميل الزيارة',
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

class _NotFound extends StatelessWidget {
  const _NotFound({required this.onBack});
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
              icon: LucideIcons.stethoscope,
              title: 'الزيارة غير موجودة',
              subtitle: 'قد تكون الزيارة قد أُزيلت أو لم تعد متاحة.',
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 240,
              child: PrimaryButton(
                label: 'العودة إلى الزيارات',
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
