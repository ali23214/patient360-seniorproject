// ════════════════════════════════════════════════════════════════════════════
//  PrescriptionDetailScreen
//  ──────────────────────────────────────────────────────────────────────────
//  Full-page detail view for a single prescription.
//  Route: `/prescriptions/:id`
//
//  Data sources (in priority order):
//    1. `extra` passed by `context.push` (instant render)
//    2. Cached list lookup from `prescriptionsProvider`
//
//  The verification card is hidden once the prescription is fully
//  dispensed (or expired/cancelled) — so the patient can't accidentally
//  re-show a finalized code.
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
import '../domain/prescription.dart';
import 'providers/prescriptions_provider.dart';
import 'widgets/medications_list_section.dart';
import 'widgets/pharmacy_verification_card.dart';
import 'widgets/prescription_detail_hero.dart';
import 'widgets/prescription_info_section.dart';
import 'widgets/prescription_note_card.dart';

class PrescriptionDetailScreen extends ConsumerWidget {
  const PrescriptionDetailScreen({
    super.key,
    required this.prescriptionId,
    this.initialPrescription,
  });

  final String prescriptionId;
  final Prescription? initialPrescription;

  Prescription? _resolve(WidgetRef ref) {
    final AsyncValue<List<Prescription>> async =
        ref.read(prescriptionsProvider);
    final List<Prescription>? all = async.value;
    if (all != null) {
      for (final Prescription p in all) {
        if (p.id == prescriptionId) return p;
      }
    }
    return initialPrescription;
  }

  void _back(BuildContext context) {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/medications');
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Watching keeps the page in sync if the list later refreshes (e.g.
    // status flips to "dispensed" after a pharmacy action).
    final AsyncValue<List<Prescription>> async =
        ref.watch(prescriptionsProvider);
    final Prescription? p = _resolve(ref);

    if (p == null && async.isLoading) {
      return _Scaffold(
        onBack: () => _back(context),
        body: const LoadingSpinner(message: 'جاري تحميل تفاصيل الوصفة...'),
      );
    }

    if (p == null && async.hasError) {
      return _Scaffold(
        onBack: () => _back(context),
        body: _ErrorView(
          error: async.error!,
          onRetry: () => ref.read(prescriptionsProvider.notifier).refresh(),
        ),
      );
    }

    if (p == null) {
      return _Scaffold(
        onBack: () => _back(context),
        body: _NotFound(onBack: () => _back(context)),
      );
    }

    return _Scaffold(
      onBack: () => _back(context),
      body: _Body(prescription: p),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Scaffold chrome — top bar + body
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
          border: Border(
            bottom: BorderSide(color: AppColors.border, width: 1),
          ),
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
                            horizontal: 12, vertical: 8),
                        child: const Row(
                          mainAxisSize: MainAxisSize.min,
                          children: <Widget>[
                            Icon(LucideIcons.arrowRight,
                                size: 16, color: AppColors.action),
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
                    'تفاصيل الوصفة',
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
// Body — composes every section
// ════════════════════════════════════════════════════════════════════════════

class _Body extends StatelessWidget {
  const _Body({required this.prescription});

  final Prescription prescription;

  bool get _showVerificationCard {
    // Hide once fully dispensed, or when expired/cancelled, or when
    // there's no verification code stored at all.
    if (prescription.isFullyDispensed) return false;
    if (prescription.status == 'expired' ||
        prescription.status == 'cancelled') {
      return false;
    }
    final String code = (prescription.verificationCode ?? '').trim();
    return code.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        PrescriptionDetailHero(
          prescriptionNumber: prescription.prescriptionNumber,
          prescriptionDate: prescription.prescriptionDate,
          status: prescription.status,
          medicationsCount: prescription.medications.length,
        ),
        PrescriptionInfoSection(prescription: prescription),
        if (_showVerificationCard)
          PharmacyVerificationCard(
            verificationCode: prescription.verificationCode!,
          ),
        MedicationsListSection(medications: prescription.medications),
        if ((prescription.prescriptionNotes ?? '').trim().isNotEmpty)
          PrescriptionNoteCard(body: prescription.prescriptionNotes!),
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
              title: 'تعذر تحميل الوصفة',
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
              icon: LucideIcons.pill,
              title: 'الوصفة غير موجودة',
              subtitle: 'قد تكون الوصفة قد أُزيلت أو لم تعد متاحة.',
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: 240,
              child: PrimaryButton(
                label: 'العودة إلى الوصفات',
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
