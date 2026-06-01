// ════════════════════════════════════════════════════════════════════════════
//  FirstAidSteps
//  ──────────────────────────────────────────────────────────────────────────
//  Numbered list of Arabic first-aid instructions. Mirrors the web's
//  `frontend/src/components/ai/FirstAidSteps.jsx` plus the matching
//  `.pd-ai-first-aid-step` and `.pd-ai-first-aid-step-number` CSS rules.
//
//  Each step is a card (background fill, border, radius-md) with a 28px
//  filled circle showing the step number. Cards animate in with a 100ms
//  stagger that matches the CSS rule:
//      animation-delay: calc(var(--step-index, 0) * 100ms);
//      animation: pd-step-fade-in 0.4s ease backwards;
//  i.e. step N starts fading in at N×100ms.
// ════════════════════════════════════════════════════════════════════════════

import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_radii.dart';

class FirstAidSteps extends StatelessWidget {
  const FirstAidSteps({super.key, required this.steps});

  final List<String> steps;

  @override
  Widget build(BuildContext context) {
    if (steps.isEmpty) return const SizedBox.shrink();

    return Semantics(
      label: 'خطوات الإسعاف الأولي',
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (int i = 0; i < steps.length; i++) ...<Widget>[
            if (i > 0) const SizedBox(height: 10),
            _StepCard(index: i, text: steps[i]),
          ],
        ],
      ),
    );
  }
}

// ─── Individual step card with stagger animation ─────────────────────────

class _StepCard extends StatefulWidget {
  const _StepCard({required this.index, required this.text});

  final int index;
  final String text;

  @override
  State<_StepCard> createState() => _StepCardState();
}

class _StepCardState extends State<_StepCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctl;
  late final Animation<double> _fade;
  late final Animation<Offset> _slide;

  @override
  void initState() {
    super.initState();
    _ctl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 400),
    );
    _fade = CurvedAnimation(parent: _ctl, curve: Curves.easeOut);
    _slide = Tween<Offset>(
      begin: const Offset(0, 0.18), // ~8px translate-y from CSS pd-step-fade-in
      end: Offset.zero,
    ).animate(_fade);

    // Stagger start: index × 100ms.
    Future<void>.delayed(
      Duration(milliseconds: widget.index * 100),
      () {
        if (mounted) _ctl.forward();
      },
    );
  }

  @override
  void dispose() {
    _ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final bool isDark = Theme.of(context).brightness == Brightness.dark;

    return FadeTransition(
      opacity: _fade,
      child: SlideTransition(
        position: _slide,
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isDark ? AppColors.backgroundDark : AppColors.background,
            border: Border.all(color: scheme.outline),
            borderRadius: AppRadii.radiusMd,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              _StepNumber(index: widget.index + 1),
              const SizedBox(width: 12),
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text(
                    widget.text,
                    style: TextStyle(
                      fontSize: 14,
                      height: 1.6,
                      color: scheme.onSurface,
                      fontFamily: 'Cairo',
                    ),
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

// ─── 28px filled action-color number badge ───────────────────────────────

class _StepNumber extends StatelessWidget {
  const _StepNumber({required this.index});

  final int index;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 28,
      height: 28,
      alignment: Alignment.center,
      decoration: const BoxDecoration(
        color: AppColors.action,
        shape: BoxShape.circle,
      ),
      child: Text(
        '$index',
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: Colors.white,
          fontFamily: 'Inter',
          height: 1.0,
        ),
      ),
    );
  }
}