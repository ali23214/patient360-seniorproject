import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/localization/arabic_labels.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/page_header.dart';
import '../../auth/domain/auth_session.dart';
import '../../auth/domain/child.dart';
import '../../auth/domain/patient_profile.dart';
import '../../auth/domain/person.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../../notifications/presentation/providers/notifications_provider.dart';
import 'profile_edit_sheet.dart';
import 'widgets/info_pair.dart';
import '../../../shared/widgets/app_drawer.dart';

/// Top-level read-only profile view. Three cards: personal info, medical
/// info, and emergency contact. Editing happens in [ProfileEditSheet].
class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<AuthSession?> async = ref.watch(authControllerProvider);
    final int unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: PageHeader(
        title: 'الملف الشخصي',
        subtitle: 'معلوماتك الشخصية والطبية',
        unreadCount: unread,
      ),
      drawer: const AppDrawer(),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (Object err, _) => Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: EmptyState(
              icon: LucideIcons.circleAlert,
              title: 'تعذر تحميل الملف',
              subtitle: err.toString(),
            ),
          ),
        ),
        data: (AuthSession? session) {
          if (session == null) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: EmptyState(
                  icon: LucideIcons.userX,
                  title: 'لم يتم تسجيل الدخول',
                ),
              ),
            );
          }
          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            children: <Widget>[
              _EditButton(session: session),
              const SizedBox(height: 12),
              _PersonalCard(session: session),
              const SizedBox(height: 12),
              _MedicalCard(patient: session.patient),
              const SizedBox(height: 12),
              _EmergencyCard(
                contact: session.patient.emergencyContact,
                session: session,
              ),
            ],
          );
        },
      ),
    );
  }
}

class _EditButton extends StatelessWidget {
  const _EditButton({required this.session});
  final AuthSession session;

  Future<void> _open(BuildContext context) async {
    await ProfileEditSheet.show(context, session);
  }

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: () => _open(context),
      icon: const Icon(LucideIcons.userPen, size: 18),
      label: const Text('تعديل الملف'),
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.action,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: const RoundedRectangleBorder(borderRadius: AppRadii.radiusMd),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Card 1 — Personal info
// ═══════════════════════════════════════════════════════════════════════════

class _PersonalCard extends StatelessWidget {
  const _PersonalCard({required this.session});
  final AuthSession session;

  @override
  Widget build(BuildContext context) {
    final Person? person = session.person;
    final Child? child = session.child;
    final String fullName = person?.fullName ?? child?.fullName ?? '—';
    final String email = session.user.email;
    final String identityLabel = session.isMinor
        ? 'رقم تسجيل قاصر'
        : 'الرقم الوطني';
    final String identityValue = session.isMinor
        ? (child?.childRegistrationNumber ?? '—')
        : (person?.nationalId ?? '—');
    final DateTime? dob = person?.dateOfBirth ?? child?.dateOfBirth;
    final int? age = dob == null ? null : _computeAge(dob);
    final String genderLabel = ArabicLabels.lookup(
      ArabicLabels.gender,
      person?.gender ?? child?.gender,
    );
    final String governorateLabel = ArabicLabels.lookup(
      ArabicLabels.governorate,
      person?.governorate ?? child?.governorate,
    );

    return _ProfileCard(
      icon: LucideIcons.user,
      title: 'المعلومات الشخصية',
      children: <Widget>[
        Text(
          fullName,
          style: Theme.of(
            context,
          ).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        InfoPair(
          label: identityLabel,
          value: identityValue,
          ltr: true,
          copyable: true,
        ),
        InfoPair(label: 'الجنس', value: genderLabel),
        if (dob != null)
          InfoPair(
            label: 'تاريخ الميلاد',
            value:
                '${intl.DateFormat('yyyy-MM-dd').format(dob)}'
                '${age != null ? '  •  $age سنة' : ''}',
            ltr: true,
          ),
        InfoPair(
          label: 'البريد الإلكتروني',
          value: email,
          ltr: true,
          locked: true,
          tooltip: 'لا يمكن تغيير البريد الإلكتروني في هذا الإصدار',
        ),
        InfoPair(
          label: 'رقم الهاتف',
          value:
              person?.phoneNumber ??
              child?.phoneNumber ??
              child?.guardianPhoneNumber ??
              '—',
          ltr: true,
        ),
        if ((person?.alternativePhoneNumber ?? '').isNotEmpty)
          InfoPair(
            label: 'هاتف بديل',
            value: person!.alternativePhoneNumber!,
            ltr: true,
          ),
        InfoPair(label: 'المحافظة', value: governorateLabel),
        InfoPair(label: 'المدينة', value: person?.city ?? child?.city ?? '—'),
        InfoPair(
          label: 'العنوان',
          value: person?.address ?? child?.address ?? '—',
        ),
        if ((person?.occupation ?? '').isNotEmpty)
          InfoPair(label: 'المهنة', value: person!.occupation!),
        if ((person?.education ?? '').isNotEmpty)
          InfoPair(label: 'التعليم', value: person!.education!),
      ],
    );
  }

  static int _computeAge(DateTime dob) {
    final DateTime now = DateTime.now();
    int age = now.year - dob.year;
    if (now.month < dob.month ||
        (now.month == dob.month && now.day < dob.day)) {
      age--;
    }
    return age;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Card 2 — Medical info
// ═══════════════════════════════════════════════════════════════════════════

class _MedicalCard extends StatelessWidget {
  const _MedicalCard({required this.patient});
  final PatientProfile patient;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return _ProfileCard(
      icon: LucideIcons.stethoscope,
      title: 'المعلومات الطبية',
      children: <Widget>[
        Row(
          children: <Widget>[
            _BloodTypeChip(bloodType: patient.bloodType),
            const SizedBox(width: 12),
            if (patient.height != null)
              _MetricChip(
                icon: LucideIcons.ruler,
                value: '${patient.height}',
                unit: 'سم',
              ),
            const SizedBox(width: 8),
            if (patient.weight != null)
              _MetricChip(
                icon: LucideIcons.weight,
                value: '${patient.weight}',
                unit: 'كغ',
              ),
            const SizedBox(width: 8),
            if (patient.bmi != null)
              _MetricChip(
                icon: LucideIcons.activity,
                value: patient.bmi!.toStringAsFixed(1),
                unit: 'BMI',
              ),
          ],
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: <Widget>[
            if (patient.smokingStatus != null)
              _LifestyleChip(
                label: ArabicLabels.lookup(
                  ArabicLabels.smokingStatus,
                  patient.smokingStatus,
                ),
                prefix: 'تدخين',
              ),
            if (patient.alcoholConsumption != null)
              _LifestyleChip(
                label: ArabicLabels.lookup(
                  ArabicLabels.alcoholConsumption,
                  patient.alcoholConsumption,
                ),
                prefix: 'كحول',
              ),
            if (patient.exerciseFrequency != null)
              _LifestyleChip(
                label: ArabicLabels.lookup(
                  ArabicLabels.exerciseFrequency,
                  patient.exerciseFrequency,
                ),
                prefix: 'رياضة',
              ),
          ],
        ),
        if (patient.allergies.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionHeader(label: 'الحساسيّات', icon: LucideIcons.bug),
          const SizedBox(height: 4),
          _TagPills(items: patient.allergies, tint: const Color(0xFFE91E63)),
        ],
        if (patient.chronicDiseases.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionHeader(
            label: 'الأمراض المزمنة',
            icon: LucideIcons.heartPulse,
          ),
          const SizedBox(height: 4),
          _TagPills(items: patient.chronicDiseases, tint: AppColors.warning),
        ],
        if (patient.currentMedications.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionHeader(
            label: 'الأدوية الحالية',
            icon: LucideIcons.pill,
          ),
          const SizedBox(height: 4),
          for (final String m in patient.currentMedications)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: <Widget>[
                  Icon(
                    LucideIcons.dot,
                    size: 14,
                    color: scheme.onSurfaceVariant,
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      m,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                ],
              ),
            ),
        ],
        if (patient.previousSurgeries.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionHeader(
            label: 'العمليات الجراحية السابقة',
            icon: LucideIcons.scissors,
          ),
          const SizedBox(height: 4),
          for (final PreviousSurgery s in patient.previousSurgeries)
            _SurgeryRow(surgery: s),
        ],
        if (patient.familyHistory.isNotEmpty) ...<Widget>[
          const SizedBox(height: 14),
          const _SectionHeader(
            label: 'التاريخ العائلي',
            icon: LucideIcons.users,
          ),
          const SizedBox(height: 4),
          _TagPills(items: patient.familyHistory, tint: AppColors.action),
        ],
      ],
    );
  }
}

class _BloodTypeChip extends StatelessWidget {
  const _BloodTypeChip({required this.bloodType});
  final String? bloodType;

  @override
  Widget build(BuildContext context) {
    final String value = bloodType ?? 'unknown';
    final String label = ArabicLabels.lookup(ArabicLabels.bloodType, value);
    final bool unknown = value == 'unknown' || bloodType == null;
    final Color color = unknown ? AppColors.warning : AppColors.error;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: AppRadii.radiusMd,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(LucideIcons.droplets, size: 16, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: color,
              fontWeight: FontWeight.w800,
              fontSize: 14,
              fontFamily: 'Inter',
            ),
          ),
        ],
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({
    required this.icon,
    required this.value,
    required this.unit,
  });
  final IconData icon;
  final String value;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Icon(icon, size: 14, color: scheme.onSurfaceVariant),
        const SizedBox(width: 4),
        Text(
          value,
          textDirection: TextDirection.ltr,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            fontFamily: 'Inter',
          ),
        ),
        const SizedBox(width: 2),
        Text(
          unit,
          style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 11),
        ),
      ],
    );
  }
}

class _LifestyleChip extends StatelessWidget {
  const _LifestyleChip({required this.label, required this.prefix});
  final String label;
  final String prefix;
  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusSm,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Text(
            '$prefix: ',
            style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
          ),
          Text(
            label,
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _TagPills extends StatelessWidget {
  const _TagPills({required this.items, required this.tint});
  final List<String> items;
  final Color tint;
  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 6,
      runSpacing: 6,
      children: <Widget>[
        for (final String item in items)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.16),
              borderRadius: AppRadii.radiusSm,
            ),
            child: Text(
              item,
              style: TextStyle(
                color: tint,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Row(
      children: <Widget>[
        Icon(icon, size: 14, color: scheme.onSurfaceVariant),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: scheme.onSurfaceVariant,
            fontWeight: FontWeight.w800,
          ),
        ),
      ],
    );
  }
}

class _SurgeryRow extends StatelessWidget {
  const _SurgeryRow({required this.surgery});
  final PreviousSurgery surgery;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  surgery.surgeryName,
                  style: Theme.of(
                    context,
                  ).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ),
              if (surgery.surgeryDate != null)
                Text(
                  intl.DateFormat('yyyy-MM-dd').format(surgery.surgeryDate!),
                  textDirection: TextDirection.ltr,
                  style: TextStyle(
                    color: scheme.onSurfaceVariant,
                    fontSize: 12,
                  ),
                ),
            ],
          ),
          if ((surgery.hospital ?? '').isNotEmpty)
            Text(
              surgery.hospital!,
              style: TextStyle(color: scheme.onSurfaceVariant, fontSize: 12),
            ),
          if ((surgery.notes ?? '').isNotEmpty)
            Text(surgery.notes!, style: Theme.of(context).textTheme.bodySmall),
        ],
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Card 3 — Emergency contact
// ═══════════════════════════════════════════════════════════════════════════

class _EmergencyCard extends StatelessWidget {
  const _EmergencyCard({required this.contact, required this.session});
  final EmergencyContact? contact;
  final AuthSession session;

  Future<void> _openEdit(BuildContext context) async {
    await ProfileEditSheet.show(context, session, focusEmergency: true);
  }

  @override
  Widget build(BuildContext context) {
    return _ProfileCard(
      icon: LucideIcons.phone,
      title: 'جهة الاتصال في الطوارئ',
      children: <Widget>[
        if (contact == null)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: EmptyState(
              icon: LucideIcons.userPlus,
              title: 'لا توجد جهة طوارئ',
              subtitle: 'أضف شخصاً يمكن التواصل معه عند الحاجة.',
              ctaLabel: 'إضافة جهة طوارئ',
              onCta: () => _openEdit(context),
            ),
          )
        else ...<Widget>[
          InfoPair(label: 'الاسم', value: contact!.name),
          InfoPair(label: 'صلة القرابة', value: contact!.relationship),
          InfoPair(label: 'رقم الهاتف', value: contact!.phoneNumber, ltr: true),
          if ((contact!.alternativePhoneNumber ?? '').isNotEmpty)
            InfoPair(
              label: 'هاتف بديل',
              value: contact!.alternativePhoneNumber!,
              ltr: true,
            ),
        ],
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared card chrome
// ═══════════════════════════════════════════════════════════════════════════

class _ProfileCard extends StatelessWidget {
  const _ProfileCard({
    required this.icon,
    required this.title,
    required this.children,
  });
  final IconData icon;
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: AppColors.action.withValues(alpha: 0.16),
                  borderRadius: AppRadii.radiusMd,
                ),
                alignment: Alignment.center,
                child: Icon(icon, size: 18, color: AppColors.action),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: Theme.of(
                  context,
                ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
              ),
            ],
          ),
          const Divider(height: 24),
          ...children,
        ],
      ),
    );
  }
}
