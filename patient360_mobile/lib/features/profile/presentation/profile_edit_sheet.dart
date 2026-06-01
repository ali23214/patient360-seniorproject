import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/localization/arabic_labels.dart';
import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/utils/logger.dart';
import '../../auth/domain/auth_session.dart';
import '../../auth/domain/child.dart';
import '../../auth/domain/patient_profile.dart';
import '../../auth/domain/person.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../data/profile_repository.dart';
import '../domain/profile_update_dto.dart';
import 'widgets/chip_input.dart';

/// Edits the patient-editable subset of [AuthSession]. Email/national ID/
/// date of birth/name are deliberately not exposed — the web doesn't
/// permit editing them either.
class ProfileEditSheet extends ConsumerStatefulWidget {
  const ProfileEditSheet({
    required this.session,
    this.focusEmergency = false,
    super.key,
  });

  final AuthSession session;
  final bool focusEmergency;

  static Future<bool?> show(
    BuildContext context,
    AuthSession session, {
    bool focusEmergency = false,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (BuildContext _) => ProfileEditSheet(
        session: session,
        focusEmergency: focusEmergency,
      ),
    );
  }

  @override
  ConsumerState<ProfileEditSheet> createState() => _ProfileEditSheetState();
}

class _ProfileEditSheetState extends ConsumerState<ProfileEditSheet> {
  late final TextEditingController _phoneCtrl;
  late final TextEditingController _altPhoneCtrl;
  late final TextEditingController _addressCtrl;
  late final TextEditingController _cityCtrl;
  late final TextEditingController _heightCtrl;
  late final TextEditingController _weightCtrl;
  late final TextEditingController _emergencyNameCtrl;
  late final TextEditingController _emergencyRelCtrl;
  late final TextEditingController _emergencyPhoneCtrl;
  final ScrollController _scrollController = ScrollController();
  final GlobalKey _emergencyKey = GlobalKey();

  late String _governorate;
  String? _bloodType;
  String? _smoking;
  late List<String> _allergies;
  late List<String> _chronic;

  bool _busy = false;
  bool _dirty = false;

  @override
  void initState() {
    super.initState();
    final Person? person = widget.session.person;
    final Child? child = widget.session.child;
    final PatientProfile patient = widget.session.patient;
    final EmergencyContact? ec = patient.emergencyContact;

    _phoneCtrl = TextEditingController(
      text: person?.phoneNumber ?? child?.phoneNumber ?? '',
    );
    _altPhoneCtrl = TextEditingController(
      text: person?.alternativePhoneNumber ??
          child?.alternativePhoneNumber ??
          '',
    );
    _addressCtrl = TextEditingController(
      text: person?.address ?? child?.address ?? '',
    );
    _cityCtrl = TextEditingController(
      text: person?.city ?? child?.city ?? '',
    );
    _heightCtrl = TextEditingController(
      text: patient.height?.toString() ?? '',
    );
    _weightCtrl = TextEditingController(
      text: patient.weight?.toString() ?? '',
    );
    _emergencyNameCtrl = TextEditingController(text: ec?.name ?? '');
    _emergencyRelCtrl =
        TextEditingController(text: ec?.relationship ?? '');
    _emergencyPhoneCtrl =
        TextEditingController(text: ec?.phoneNumber ?? '');

    _governorate = person?.governorate ?? child?.governorate ?? 'damascus';
    _bloodType = patient.bloodType;
    _smoking = patient.smokingStatus;
    _allergies = List<String>.from(patient.allergies);
    _chronic = List<String>.from(patient.chronicDiseases);

    for (final TextEditingController c in <TextEditingController>[
      _phoneCtrl,
      _altPhoneCtrl,
      _addressCtrl,
      _cityCtrl,
      _heightCtrl,
      _weightCtrl,
      _emergencyNameCtrl,
      _emergencyRelCtrl,
      _emergencyPhoneCtrl,
    ]) {
      c.addListener(_markDirty);
    }

    if (widget.focusEmergency) {
      WidgetsBinding.instance.addPostFrameCallback((Duration _) {
        _scrollToEmergency();
      });
    }
  }

  @override
  void dispose() {
    for (final TextEditingController c in <TextEditingController>[
      _phoneCtrl,
      _altPhoneCtrl,
      _addressCtrl,
      _cityCtrl,
      _heightCtrl,
      _weightCtrl,
      _emergencyNameCtrl,
      _emergencyRelCtrl,
      _emergencyPhoneCtrl,
    ]) {
      c.dispose();
    }
    _scrollController.dispose();
    super.dispose();
  }

  void _markDirty() {
    if (!_dirty && mounted) setState(() => _dirty = true);
  }

  void _scrollToEmergency() {
    final BuildContext? ctx = _emergencyKey.currentContext;
    if (ctx == null) return;
    Scrollable.ensureVisible(
      ctx,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeOut,
    );
  }

  bool get _canSave =>
      _phoneCtrl.text.trim().isNotEmpty &&
      _addressCtrl.text.trim().isNotEmpty &&
      _cityCtrl.text.trim().isNotEmpty &&
      !_busy;

  ProfileUpdateDto _buildDto() {
    EmergencyContactDto? emergency;
    final String name = _emergencyNameCtrl.text.trim();
    final String rel = _emergencyRelCtrl.text.trim();
    final String phone = _emergencyPhoneCtrl.text.trim();
    if (name.isNotEmpty && rel.isNotEmpty && phone.isNotEmpty) {
      emergency = EmergencyContactDto(
        name: name,
        relationship: rel,
        phoneNumber: phone,
      );
    }

    return ProfileUpdateDto(
      phoneNumber: _phoneCtrl.text.trim(),
      alternativePhoneNumber: _altPhoneCtrl.text.trim().isEmpty
          ? null
          : _altPhoneCtrl.text.trim(),
      address: _addressCtrl.text.trim(),
      governorate: _governorate,
      city: _cityCtrl.text.trim(),
      bloodType: _bloodType,
      height: num.tryParse(_heightCtrl.text.trim()),
      weight: num.tryParse(_weightCtrl.text.trim()),
      smokingStatus: _smoking,
      allergies: _allergies,
      chronicDiseases: _chronic,
      emergencyContact: emergency,
    );
  }

  Future<void> _save() async {
    if (!_canSave) return;
    setState(() => _busy = true);
    try {
      final UpdatedProfileBundle bundle = await ref
          .read(profileRepositoryProvider)
          .updateMyProfile(_buildDto());
      // Patch the live AuthSession in the auth controller's state so every
      // screen that reads from it picks up the updated values immediately.
      final AuthSession? current = ref.read(authControllerProvider).value;
      if (current != null) {
        ref
            .read(authControllerProvider.notifier)
            .applySessionUpdate(bundle.applyTo(current));
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تم الحفظ')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toDisplayMessage())),
      );
    } catch (e, st) {
      appLogger.w('profile save failed', error: e, stackTrace: st);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تعذر الحفظ. حاول مرة أخرى.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    if (!_dirty) {
      Navigator.of(context).pop(false);
      return;
    }
    final bool? discard = await showDialog<bool>(
      context: context,
      builder: (BuildContext ctx) => AlertDialog(
        title: const Text('تجاهل التعديلات؟'),
        content: const Text('ستُفقد التغييرات غير المحفوظة.'),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('عودة'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: Colors.white,
            ),
            child: const Text('تجاهل'),
          ),
        ],
      ),
    );
    if (discard == true && mounted) {
      Navigator.of(context).pop(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.92,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (BuildContext _, ScrollController controller) {
        return SingleChildScrollView(
          controller: controller,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text(
                'تعديل الملف',
                style: Theme.of(context)
                    .textTheme
                    .titleLarge
                    ?.copyWith(fontWeight: FontWeight.w800),
              ),
              const SizedBox(height: 12),

              // ─── Contact section ─────────────────────────────────────
              const _SectionTitle('معلومات التواصل'),
              const SizedBox(height: 6),
              _LabeledField(
                label: 'رقم الهاتف',
                controller: _phoneCtrl,
                ltr: true,
                requiredField: true,
              ),
              _LabeledField(
                label: 'هاتف بديل',
                controller: _altPhoneCtrl,
                ltr: true,
              ),
              _LabeledField(
                label: 'العنوان',
                controller: _addressCtrl,
                requiredField: true,
                maxLines: 2,
              ),
              _GovernorateDropdown(
                value: _governorate,
                onChanged: (String v) {
                  setState(() {
                    _governorate = v;
                    _dirty = true;
                  });
                },
              ),
              _LabeledField(
                label: 'المدينة',
                controller: _cityCtrl,
                requiredField: true,
              ),

              const SizedBox(height: 14),

              // ─── Medical section ─────────────────────────────────────
              const _SectionTitle('المعلومات الطبية'),
              const SizedBox(height: 6),
              _BloodTypeDropdown(
                value: _bloodType,
                onChanged: (String? v) {
                  setState(() {
                    _bloodType = v;
                    _dirty = true;
                  });
                },
              ),
              Row(
                children: <Widget>[
                  Expanded(
                    child: _LabeledField(
                      label: 'الطول (سم)',
                      controller: _heightCtrl,
                      ltr: true,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _LabeledField(
                      label: 'الوزن (كغ)',
                      controller: _weightCtrl,
                      ltr: true,
                      keyboardType: TextInputType.number,
                    ),
                  ),
                ],
              ),
              _SmokingDropdown(
                value: _smoking,
                onChanged: (String? v) {
                  setState(() {
                    _smoking = v;
                    _dirty = true;
                  });
                },
              ),
              const SizedBox(height: 12),
              ChipInput(
                label: 'الحساسيّات',
                values: _allergies,
                tint: const Color(0xFFE91E63),
                hintText: 'مثل: حبوب الطلع، البنسلين',
                onChanged: (List<String> v) {
                  setState(() {
                    _allergies = v;
                    _dirty = true;
                  });
                },
              ),
              const SizedBox(height: 12),
              ChipInput(
                label: 'الأمراض المزمنة',
                values: _chronic,
                tint: AppColors.warning,
                hintText: 'مثل: ضغط الدم، السكري',
                onChanged: (List<String> v) {
                  setState(() {
                    _chronic = v;
                    _dirty = true;
                  });
                },
              ),

              const SizedBox(height: 14),

              // ─── Emergency section ───────────────────────────────────
              Padding(
                key: _emergencyKey,
                padding: EdgeInsets.zero,
                child: const _SectionTitle('جهة الاتصال في الطوارئ'),
              ),
              const SizedBox(height: 6),
              _LabeledField(
                label: 'الاسم',
                controller: _emergencyNameCtrl,
              ),
              _LabeledField(
                label: 'صلة القرابة',
                controller: _emergencyRelCtrl,
              ),
              _LabeledField(
                label: 'رقم الهاتف',
                controller: _emergencyPhoneCtrl,
                ltr: true,
              ),

              const SizedBox(height: 20),
              Row(
                children: <Widget>[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: _busy ? null : _cancel,
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: const RoundedRectangleBorder(
                          borderRadius: AppRadii.radiusMd,
                        ),
                      ),
                      child: const Text('إلغاء'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: _canSave ? _save : null,
                      icon: _busy
                          ? const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                              ),
                            )
                          : const Icon(LucideIcons.save, size: 16),
                      label: Text(_busy ? 'جاري الحفظ...' : 'حفظ'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.action,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: const RoundedRectangleBorder(
                          borderRadius: AppRadii.radiusMd,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
          ),
    );
  }
}

class _LabeledField extends StatelessWidget {
  const _LabeledField({
    required this.label,
    required this.controller,
    this.requiredField = false,
    this.ltr = false,
    this.maxLines = 1,
    this.keyboardType,
  });

  final String label;
  final TextEditingController controller;
  final bool requiredField;
  final bool ltr;
  final int maxLines;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Text(
                label,
                style: Theme.of(context).textTheme.labelMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                      fontWeight: FontWeight.w600,
                    ),
              ),
              if (requiredField)
                const Text(
                  ' *',
                  style: TextStyle(
                    color: AppColors.error,
                    fontWeight: FontWeight.w800,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          TextField(
            controller: controller,
            textDirection: ltr ? TextDirection.ltr : null,
            maxLines: maxLines,
            keyboardType: keyboardType,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _GovernorateDropdown extends StatelessWidget {
  const _GovernorateDropdown({required this.value, required this.onChanged});
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'المحافظة',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: value,
            isExpanded: true,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
            ),
            items: <DropdownMenuItem<String>>[
              for (final MapEntry<String, String> e
                  in ArabicLabels.governorate.entries)
                DropdownMenuItem<String>(
                  value: e.key,
                  child: Text(e.value),
                ),
            ],
            onChanged: (String? v) {
              if (v != null) onChanged(v);
            },
          ),
        ],
      ),
    );
  }
}

class _BloodTypeDropdown extends StatelessWidget {
  const _BloodTypeDropdown({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'فصيلة الدم',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: value ?? 'unknown',
            isExpanded: true,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
            ),
            items: <DropdownMenuItem<String>>[
              for (final MapEntry<String, String> e
                  in ArabicLabels.bloodType.entries)
                DropdownMenuItem<String>(
                  value: e.key,
                  child: Text(e.value),
                ),
            ],
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}

class _SmokingDropdown extends StatelessWidget {
  const _SmokingDropdown({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            'حالة التدخين',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            initialValue: value ?? 'never',
            isExpanded: true,
            decoration: InputDecoration(
              isDense: true,
              border: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: AppRadii.radiusMd,
                borderSide: BorderSide(color: scheme.outline),
              ),
            ),
            items: <DropdownMenuItem<String>>[
              for (final MapEntry<String, String> e
                  in ArabicLabels.smokingStatus.entries)
                DropdownMenuItem<String>(
                  value: e.key,
                  child: Text(e.value),
                ),
            ],
            onChanged: onChanged,
          ),
        ],
      ),
    );
  }
}
