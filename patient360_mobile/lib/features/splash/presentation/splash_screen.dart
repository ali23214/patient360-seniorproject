// ============================================================================
// Patient360 — Splash Screen
// ----------------------------------------------------------------------------
// Branded splash shown for ~1.6s before the auth router decides where to go.
// Pure visual screen with no business logic; the AuthController + go_router
// redirect callback handle the actual navigation after this screen fades out.
//
// Visual layers:
//   1. Teal gradient background (primary → action) — full bleed
//   2. Decorative blurred circles for texture
//   3. Logo bubble: white circle with the Patient360 launcher icon inside,
//      fades + scales in from 95% to 100%
//   4. Wordmark "Patient360" — Inter 34/800 white, fades in 200ms later
//   5. Tagline "صحتك الشاملة بين يديك" — Cairo 14/500 white@88%
//   6. Subtle linear loading bar at the bottom
//
// After [_holdDuration] the splash calls [onComplete] which the parent
// uses to mark "splash finished" so the router can move on.
// ============================================================================

import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/theme/app_colors.dart';

/// Patient360 branded splash screen. Stateless from the outside — the parent
/// passes [onComplete] and the widget self-destructs by signalling completion
/// after the hold duration elapses.
class SplashScreen extends StatefulWidget {
  const SplashScreen({required this.onComplete, super.key});

  /// Fired once when the splash finishes its intro animation + hold window.
  /// The parent should react by routing away from this screen.
  final VoidCallback onComplete;

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with TickerProviderStateMixin {
  // Hold duration: total time the splash is visible (intro + dwell).
  static const Duration _introDuration = Duration(milliseconds: 700);
  static const Duration _holdDuration = Duration(milliseconds: 1600);

  late final AnimationController _logoController;
  late final Animation<double> _logoScale;
  late final Animation<double> _logoFade;

  late final AnimationController _textController;
  late final Animation<double> _textFade;
  late final Animation<Offset> _textSlide;

  late final AnimationController _barController;

  Timer? _completionTimer;

  @override
  void initState() {
    super.initState();

    // -- Logo: scale 0.85 → 1.0 + fade 0 → 1 over 700ms ---------------------
    _logoController = AnimationController(
      vsync: this,
      duration: _introDuration,
    );
    _logoScale = CurvedAnimation(
      parent: _logoController,
      curve: Curves.easeOutCubic,
    ).drive(Tween<double>(begin: 0.85, end: 1.0));
    _logoFade = CurvedAnimation(
      parent: _logoController,
      curve: Curves.easeOut,
    );

    // -- Text: fade + slide up, starts 200ms after logo --------------------
    _textController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _textFade = CurvedAnimation(
      parent: _textController,
      curve: Curves.easeOut,
    );
    _textSlide = Tween<Offset>(
      begin: const Offset(0, 0.25),
      end: Offset.zero,
    ).animate(
      CurvedAnimation(parent: _textController, curve: Curves.easeOutCubic),
    );

    // -- Loading bar: linear 0 → 1 across the full hold duration -----------
    _barController = AnimationController(
      vsync: this,
      duration: _holdDuration,
    );

    _logoController.forward();
    Future<void>.delayed(const Duration(milliseconds: 200), () {
      if (mounted) _textController.forward();
    });
    Future<void>.delayed(const Duration(milliseconds: 350), () {
      if (mounted) _barController.forward();
    });

    _completionTimer = Timer(_holdDuration, () {
      if (mounted) widget.onComplete();
    });
  }

  @override
  void dispose() {
    _completionTimer?.cancel();
    _logoController.dispose();
    _textController.dispose();
    _barController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: <Color>[
              AppColors.primary,
              AppColors.action,
            ],
          ),
        ),
        child: SafeArea(
          child: Stack(
            children: <Widget>[
              // ─── Decorative circles (subtle texture) ────────────────────
              Positioned(
                top: -60,
                right: -50,
                child: _SoftCircle(
                  size: 180,
                  color: Colors.white.withValues(alpha: 0.06),
                ),
              ),
              Positioned(
                bottom: 100,
                left: -70,
                child: _SoftCircle(
                  size: 220,
                  color: Colors.white.withValues(alpha: 0.05),
                ),
              ),
              Positioned(
                top: 200,
                left: -30,
                child: _SoftCircle(
                  size: 100,
                  color: Colors.white.withValues(alpha: 0.04),
                ),
              ),

              // ─── Centered branding (logo + text) ────────────────────────
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: <Widget>[
                    // Logo
                    FadeTransition(
                      opacity: _logoFade,
                      child: ScaleTransition(
                        scale: _logoScale,
                        child: _LogoBubble(),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Wordmark + tagline
                    SlideTransition(
                      position: _textSlide,
                      child: FadeTransition(
                        opacity: _textFade,
                        child: Column(
                          children: <Widget>[
                            const Text(
                              'Patient360',
                              textDirection: TextDirection.ltr,
                              style: TextStyle(
                                fontFamily: 'Inter',
                                color: Colors.white,
                                fontSize: 34,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.6,
                                height: 1.0,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Text(
                              'صحتك الشاملة بين يديك',
                              textDirection: TextDirection.rtl,
                              style: TextStyle(
                                fontFamily: 'Cairo',
                                color: Colors.white.withValues(alpha: 0.88),
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                letterSpacing: 0.3,
                                height: 1.2,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // ─── Linear loading bar (bottom) ────────────────────────────
              Positioned(
                left: 0,
                right: 0,
                bottom: 56,
                child: Center(
                  child: SizedBox(
                    width: 120,
                    height: 3,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(2),
                      child: AnimatedBuilder(
                        animation: _barController,
                        builder: (BuildContext context, Widget? _) {
                          return LinearProgressIndicator(
                            value: _barController.value,
                            minHeight: 3,
                            backgroundColor:
                                Colors.white.withValues(alpha: 0.18),
                            valueColor: const AlwaysStoppedAnimation<Color>(
                              Colors.white,
                            ),
                          );
                        },
                      ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

/// White circular bubble with the launcher icon embedded.
/// Renders the same heart-pulse glyph as the app launcher icon
/// (assets/branding/patient360_logo.png).
class _LogoBubble extends StatelessWidget {
  const _LogoBubble();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 132,
      height: 132,
      decoration: BoxDecoration(
        color: Colors.white,
        shape: BoxShape.circle,
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.18),
            blurRadius: 28,
            offset: const Offset(0, 10),
            spreadRadius: -2,
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Image.asset(
        'assets/branding/patient360_logo.png',
        fit: BoxFit.contain,
        // Fallback: if the asset fails to load, render an icon glyph instead
        // so the splash never crashes on first install.
        errorBuilder: (BuildContext _, Object __, StackTrace? ___) {
          return const Icon(
            Icons.favorite,
            color: AppColors.action,
            size: 64,
          );
        },
      ),
    );
  }
}

/// Decorative soft circle used as low-opacity background texture.
class _SoftCircle extends StatelessWidget {
  const _SoftCircle({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
      ),
    );
  }
}
