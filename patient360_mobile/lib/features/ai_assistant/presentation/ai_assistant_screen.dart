// ════════════════════════════════════════════════════════════════════════════
//  AIAssistantScreen — Patient 360° (mobile)
//  ──────────────────────────────────────────────────────────────────────────
//  Mirrors the web's renderAIAssistant() in PatientDashboard.jsx. A single
//  triage surface with three input modes — text / image / voice — matching
//  the web 1:1.
//
//  Visual structure (top to bottom):
//    1. PageHeader            (AppBar with title + subtitle + bell + theme)
//    2. _IntroPanel           (red banner: "الإسعاف الأولي الذكي")
//    3. InputModeToggle       (text / image / voice tabs)
//    4. Input area            (whichever mode is selected)
//    5. ResultCard            (async result, or empty/loading/error)
//    6. _HistorySection       (past emergency reports)
//
//  Critical reports (severity = critical) automatically open a dialog
//  prompting the user to dial the ambulance hotline 110.
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
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/page_header.dart';
import '../../home/presentation/providers/home_providers.dart';
import '../domain/emergency_report.dart';
import '../domain/severity_level.dart';
import 'providers/ai_providers.dart';
import 'widgets/emergency_report_tile.dart';
import 'widgets/empty_state.dart';
import 'widgets/input_audio.dart';
import 'widgets/input_image.dart';
import 'widgets/input_mode_toggle.dart';
import 'widgets/input_text.dart';
import 'widgets/report_detail_sheet.dart';
import 'widgets/result_card.dart';

const String _ambulanceNumber = '110';

class AIAssistantScreen extends ConsumerStatefulWidget {
  const AIAssistantScreen({super.key});

  @override
  ConsumerState<AIAssistantScreen> createState() => _AIAssistantScreenState();
}

class _AIAssistantScreenState extends ConsumerState<AIAssistantScreen> {
  final TextEditingController _triageText = TextEditingController();
  AiInputMode _triageMode = AiInputMode.text;
  XFile? _triageImage;
  File? _triageAudio;

  final Set<String> _criticalDialogShownIds = <String>{};

  @override
  void dispose() {
    _triageText.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final int unread =
        ref.watch(dashboardOverviewProvider).value?.unreadNotifications ?? 0;

    ref.listen<AsyncValue<EmergencyReport?>>(triageControllerProvider, (
      AsyncValue<EmergencyReport?>? _,
      AsyncValue<EmergencyReport?> next,
    ) {
      final EmergencyReport? r = next.value;
      if (r == null) return;
      if (r.aiRiskLevel != SeverityLevel.critical) return;
      if (_criticalDialogShownIds.contains(r.id)) return;
      _criticalDialogShownIds.add(r.id);
      _showCriticalDialog(r);
    });

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: PageHeader(
        title: 'المساعد الذكي',
        subtitle: 'الإسعاف الأولي الذكي',
        unreadCount: unread,
      ),
      body: _TriageContent(
        textController: _triageText,
        mode: _triageMode,
        onModeChange: (AiInputMode m) => setState(() => _triageMode = m),
        pickedImage: _triageImage,
        onImageChange: (XFile? f) => setState(() => _triageImage = f),
        pickedAudio: _triageAudio,
        onAudioChange: (File? f) => setState(() => _triageAudio = f),
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
          icon: const Icon(
            LucideIcons.octagonAlert,
            color: AppColors.error,
            size: 36,
          ),
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
// Triage content — the body of the screen
// ════════════════════════════════════════════════════════════════════════════

class _TriageContent extends ConsumerWidget {
  const _TriageContent({
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
    final AsyncValue<EmergencyReport?> async = ref.watch(
      triageControllerProvider,
    );
    final AsyncValue<List<EmergencyReport>> historyAsync = ref.watch(
      emergencyReportsProvider,
    );
    final bool busy = async.isLoading;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
      children: <Widget>[
        const _IntroPanel(
          title: 'الإسعاف الأولي الذكي',
          body:
              'صف حالتك أو ارفع صورة للإصابة وسنوفر لك إرشادات الإسعاف '
              'الأولي. في حالة الطوارئ الحقيقية، اتصل بالإسعاف فوراً.',
        ),
        const SizedBox(height: 16),
        InputModeToggle(current: mode, onChanged: onModeChange, disabled: busy),
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
// Intro panel — red emergency banner at the top of the screen
// ════════════════════════════════════════════════════════════════════════════

class _IntroPanel extends StatelessWidget {
  const _IntroPanel({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFEBEE),
        borderRadius: AppRadii.radiusMd,
        border: Border.all(color: const Color(0xFFFFCDD2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Icon(
            LucideIcons.triangleAlert,
            size: 20,
            color: AppColors.error,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: AppColors.error,
                    fontFamily: 'Cairo',
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 13,
                    height: 1.6,
                    color: Color(0xFFB71C1C),
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
// History section — past emergency reports
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
