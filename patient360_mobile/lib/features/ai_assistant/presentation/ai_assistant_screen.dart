// ════════════════════════════════════════════════════════════════════════════
//  AIAssistantScreen — Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Mirrors the web's renderAIAssistant() in PatientDashboard.jsx. Two
//  subtabs: استشارة الأخصائي + الإسعاف الأولي. The triage tab now supports
//  three input modes — text / image / voice — matching the web 1:1.
// ════════════════════════════════════════════════════════════════════════════

import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/utils/logger.dart';
import '../../../shared/widgets/page_header.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/emergency_report.dart';
import '../domain/severity_level.dart';
import '../domain/specialist_result.dart';
import 'providers/ai_providers.dart';
import 'widgets/emergency_report_tile.dart';
import 'widgets/empty_state.dart';
import 'widgets/input_audio.dart';
import 'widgets/input_image.dart';
import 'widgets/input_mode_toggle.dart';
import 'widgets/input_text.dart';
import 'widgets/report_detail_sheet.dart';
import 'widgets/result_card.dart';

enum _AiTab { specialist, triage }

const String _ambulanceNumber = '110';

class AIAssistantScreen extends ConsumerStatefulWidget {
  const AIAssistantScreen({super.key});

  @override
  ConsumerState<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends ConsumerState<AIAssistantScreen> {
  _AiTab _tab = _AiTab.triage;
  final TextEditingController _specialistText = TextEditingController();
  final TextEditingController _triageText = TextEditingController();
  AiInputMode _triageMode = AiInputMode.text;
  XFile? _triageImage;
  File? _triageAudio;

  final Set<String> _criticalDialogShownIds = <String>{};

  @override
  void dispose() {
    _specialistText.dispose();
    _triageText.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final int unread = ref
            .watch(dashboardOverviewProvider)
            .value
            ?.unreadNotifications ??
        0;

    ref.listen<AsyncValue<EmergencyReport?>>(
      triageControllerProvider,
      (AsyncValue<EmergencyReport?>? _, AsyncValue<EmergencyReport?> next) {
        final EmergencyReport? r = next.value;
        if (r == null) return;
        if (r.aiRiskLevel != SeverityLevel.critical) return;
        if (_criticalDialogShownIds.contains(r.id)) return;
        _criticalDialogShownIds.add(r.id);
        _showCriticalDialog(r);
      },
    );

    return Scaffold(
      appBar: PageHeader(
        title: 'المساعد الذكي',
        subtitle: 'استشارة الأخصائي والإسعاف الأولي',
        unreadCount: unread,
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: _SubTabRow(
              current: _tab,
              onChange: (_AiTab t) => setState(() => _tab = t),
            ),
          ),
          Expanded(
            child: IndexedStack(
              index: _tab.index,
              children: <Widget>[
                _SpecialistTab(controller: _specialistText),
                _TriageTab(
                  textController: _triageText,
                  mode: _triageMode,
                  onModeChange: (AiInputMode m) =>
                      setState(() => _triageMode = m),
                  pickedImage: _triageImage,
                  onImageChange: (XFile? f) =>
                      setState(() => _triageImage = f),
                  pickedAudio: _triageAudio,
                  onAudioChange: (File? f) =>
                      setState(() => _triageAudio = f),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _showCriticalDialog(EmergencyReport r) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (BuildContext ctx) {
        return AlertDialog(
          icon: const Icon(LucideIcons.octagonAlert,
              color: AppColors.error, size: 36),
          title: const Text(
            'حالة حرجة',
            style: TextStyle(fontWeight: FontWeight.w800),
            textAlign: TextAlign.center,
          ),
          content: const Text(
            'الإسعاف الأولي بدأ الآن. اتصل بالإسعاف فوراً.',
            style: TextStyle(height: 1.6),
            textAlign: TextAlign.center,
          ),
          actionsAlignment: MainAxisAlignment.center,
          actions: <Widget>[
            ElevatedButton.icon(
              icon: const Icon(LucideIcons.phone, size: 18),
              label: const Text('اتصل بالإسعاف $_ambulanceNumber'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.error,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                Navigator.of(ctx).pop();
                await _dialAmbulance();
              },
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(),
              child: const Text('إغلاق'),
            ),
          ],
        );
      },
    );
  }
}

Future<void> _dialAmbulance() async {
  final Uri tel = Uri(scheme: 'tel', path: _ambulanceNumber);
  try {
    await launchUrl(tel);
  } catch (e, st) {
    appLogger.w('tel: launch failed', error: e, stackTrace: st);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Subtab row
// ════════════════════════════════════════════════════════════════════════════

class _SubTabRow extends StatelessWidget {
  const _SubTabRow({required this.current, required this.onChange});

  final _AiTab current;
  final ValueChanged<_AiTab> onChange;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: _SubTabButton(
              icon: LucideIcons.stethoscope,
              label: 'استشارة الأخصائي',
              selected: current == _AiTab.specialist,
              onTap: () => onChange(_AiTab.specialist),
            ),
          ),
          Expanded(
            child: _SubTabButton(
              icon: LucideIcons.siren,
              label: 'الإسعاف الأولي',
              selected: current == _AiTab.triage,
              onTap: () => onChange(_AiTab.triage),
            ),
          ),
        ],
      ),
    );
  }
}

class _SubTabButton extends StatelessWidget {
  const _SubTabButton({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final Color fg = selected ? scheme.primary : scheme.onSurfaceVariant;
    final Color bg = selected ? scheme.surfaceContainer : Colors.transparent;

    return Material(
      color: bg,
      borderRadius: AppRadii.radiusMd,
      elevation: selected ? 1 : 0,
      shadowColor: scheme.primary.withValues(alpha: 0.06),
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(icon, size: 16, color: fg),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: fg,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    fontSize: 13,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Specialist tab
// ════════════════════════════════════════════════════════════════════════════

class _SpecialistTab extends ConsumerWidget {
  const _SpecialistTab({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<SpecialistResult?> async =
        ref.watch(specialistControllerProvider);

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        const _IntroPanel(
          tone: _IntroTone.info,
          title: 'اختر الأخصائي المناسب لأعراضك',
          body:
              'اكتب أعراضك وسيقترح لك المساعد الذكي نوع الطبيب المناسب '
              'لحالتك. هذه النتيجة للإرشاد فقط ولا تحل محل الاستشارة الطبية.',
        ),
        const SizedBox(height: 16),
        InputText(
          controller: controller,
          maxLength: 2000,
          disabled: async.isLoading,
          hintText:
              'صف أعراضك بلغة واضحة، مثل: ألم في الصدر وضيق في التنفس منذ يومين...',
          onSubmit: () {
            final String text = controller.text.trim();
            if (text.isEmpty) return;
            // ignore: discarded_futures
            ref.read(specialistControllerProvider.notifier).submit(text);
          },
        ),
        const SizedBox(height: 16),
        if (async.isLoading)
          const ResultCard.loading()
        else if (async.hasError)
          ResultCard.error(error: async.error!)
        else if (async.value != null)
          ResultCard.specialist(result: async.value!)
        else
          const ResultCard.empty(),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Triage tab
// ════════════════════════════════════════════════════════════════════════════

class _TriageTab extends ConsumerWidget {
  const _TriageTab({
    required this.textController,
    required this.mode,
    required this.onModeChange,
    required this.pickedImage,
    required this.onImageChange,
    required this.pickedAudio,
    required this.onAudioChange,
  });

  final TextEditingController textController;
  final AiInputMode mode;
  final ValueChanged<AiInputMode> onModeChange;
  final XFile? pickedImage;
  final ValueChanged<XFile?> onImageChange;
  final File? pickedAudio;
  final ValueChanged<File?> onAudioChange;

  void _alert(BuildContext context, String message) {
    ScaffoldMessenger.maybeOf(context)
      ?..clearSnackBars()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<EmergencyReport?> async =
        ref.watch(triageControllerProvider);
    final AsyncValue<List<EmergencyReport>> historyAsync =
        ref.watch(emergencyReportsProvider);
    final bool busy = async.isLoading;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        const _IntroPanel(
          tone: _IntroTone.emergency,
          title: 'الإسعاف الأولي الذكي',
          body:
              'صف حالتك أو ارفع صورة للإصابة وسنوفر لك إرشادات الإسعاف '
              'الأولي. في حالة الطوارئ الحقيقية، اتصل بالإسعاف فوراً.',
        ),
        const SizedBox(height: 16),
        InputModeToggle(
          current: mode,
          onChanged: onModeChange,
          disabled: busy,
        ),
        const SizedBox(height: 12),
        if (mode == AiInputMode.text)
          InputText(
            controller: textController,
            maxLength: 2000,
            disabled: busy,
            hintText: 'صف الحالة — مثال: جرح في اليد ينزف منذ 5 دقائق...',
            onSubmit: () {
              final String text = textController.text.trim();
              if (text.isEmpty) return;
              // ignore: discarded_futures
              ref.read(triageControllerProvider.notifier).submitText(text);
            },
          )
        else if (mode == AiInputMode.image)
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              InputImage(
                value: pickedImage,
                onChanged: onImageChange,
                onAlert: (String msg) => _alert(context, msg),
                disabled: busy,
              ),
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: (pickedImage == null || busy)
                    ? null
                    : () {
                        // ignore: discarded_futures
                        ref
                            .read(triageControllerProvider.notifier)
                            .submitImage(pickedImage!);
                      },
                icon: const Icon(LucideIcons.send, size: 16),
                label: const Text('تحليل الصورة'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.action,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
              ),
            ],
          )
        else
          // mode == AiInputMode.voice
          InputAudio(
            disabled: busy,
            onChanged: onAudioChange,
            onAlert: (String msg) => _alert(context, msg),
            onSubmit: (File audioFile) {
              // ignore: discarded_futures
              ref
                  .read(triageControllerProvider.notifier)
                  .submitVoice(XFile(audioFile.path));
            },
          ),
        const SizedBox(height: 16),
        if (async.isLoading)
          const ResultCard.loading()
        else if (async.hasError)
          ResultCard.error(error: async.error!)
        else if (async.value != null)
          ResultCard.triage(report: async.value!)
        else
          const ResultCard.empty(
            emptyTitle: 'ابدأ بوصف الحالة الطارئة',
            emptySubtitle:
                'سيقوم المساعد الذكي بتقييم الخطورة واقتراح خطوات الإسعاف الأولي.',
          ),
        const SizedBox(height: 24),
        _HistorySection(historyAsync: historyAsync),
      ],
    );
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Intro panel
// ════════════════════════════════════════════════════════════════════════════

enum _IntroTone { info, emergency }

class _IntroPanel extends StatelessWidget {
  const _IntroPanel({
    required this.tone,
    required this.title,
    required this.body,
  });

  final _IntroTone tone;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isEmergency = tone == _IntroTone.emergency;

    final Color bg = isEmergency
        ? const Color(0xFFFFEBEE)
        : scheme.surfaceContainerHighest;
    final Color borderColor = isEmergency
        ? const Color(0xFFFFCDD2)
        : scheme.outline;
    final Color titleColor = isEmergency ? AppColors.error : scheme.primary;
    final Color bodyColor = isEmergency
        ? const Color(0xFFB71C1C)
        : scheme.onSurfaceVariant;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: borderColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (isEmergency) ...<Widget>[
            const Icon(
              LucideIcons.triangleAlert,
              size: 20,
              color: AppColors.error,
            ),
            const SizedBox(width: 12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: titleColor,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.6,
                    color: bodyColor,
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

// ════════════════════════════════════════════════════════════════════════════
// History section
// ════════════════════════════════════════════════════════════════════════════

class _HistorySection extends StatelessWidget {
  const _HistorySection({required this.historyAsync});

  final AsyncValue<List<EmergencyReport>> historyAsync;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: scheme.surface,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(LucideIcons.clock, size: 18, color: scheme.primary),
              const SizedBox(width: 8),
              Text(
                'السجل السابق',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: scheme.primary,
                  fontFamily: 'Cairo',
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          historyAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(20),
              child: Center(
                child: SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(strokeWidth: 2.5),
                ),
              ),
            ),
            error: (Object _, __) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                'تعذر تحميل السجل.',
                textAlign: TextAlign.center,
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            ),
            data: (List<EmergencyReport> list) {
              if (list.isEmpty) {
                return const EmptyState(
                  icon: LucideIcons.clock,
                  title: 'لا يوجد سجل',
                  subtitle: 'ستظهر هنا تقاريرك السابقة بعد إرسال أول طلب.',
                );
              }
              return Column(
                children: <Widget>[
                  for (final EmergencyReport r in list)
                    EmergencyReportTile(
                      report: r,
                      onTap: () => ReportDetailSheet.show(context, r),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}