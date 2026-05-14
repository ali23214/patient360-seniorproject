import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../data/auth_repository.dart';
import '../domain/auth_session.dart';
import 'providers/auth_provider.dart';

/// Phone-sized replica of the web Login screen: Teal Medica hero gradient
/// over the top 40% with a white card floating over the bottom 60%.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    FocusScope.of(context).unfocus();

    await ref.read(authControllerProvider.notifier).login(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
  }

  void _openForgotPasswordSheet() {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (BuildContext ctx) => ForgotPasswordSheet(
          initialEmail: _emailController.text.trim(),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AsyncValue<AuthSession?>>(authControllerProvider,
        (AsyncValue<AuthSession?>? prev, AsyncValue<AuthSession?> next) {
      if (next.hasError && prev?.hasError != true) {
        final Object error = next.error!;
        final String message = error is ApiException
            ? error.toDisplayMessage()
            : 'حدث خطأ في تسجيل الدخول';
        _showErrorSnack(context, message);
      }
    });

    final AsyncValue<AuthSession?> authState =
        ref.watch(authControllerProvider);
    final bool isLoading = authState.isLoading;

    return Scaffold(
      backgroundColor: AppColors.background,
      resizeToAvoidBottomInset: true,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (BuildContext ctx, BoxConstraints constraints) {
            final double heroHeight = constraints.maxHeight * 0.40;
            return SingleChildScrollView(
              padding: EdgeInsets.zero,
              child: ConstrainedBox(
                constraints:
                    BoxConstraints(minHeight: constraints.maxHeight),
                child: Stack(
                  children: <Widget>[
                    Container(
                      height: heroHeight + 60,
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
                      child: const _HeroBranding(),
                    ),
                    Padding(
                      padding: EdgeInsets.only(top: heroHeight),
                      child: _LoginCard(
                        formKey: _formKey,
                        emailController: _emailController,
                        passwordController: _passwordController,
                        obscurePassword: _obscurePassword,
                        onToggleObscure: () {
                          setState(() {
                            _obscurePassword = !_obscurePassword;
                          });
                        },
                        onSubmit: isLoading ? null : _submit,
                        onForgotPassword:
                            isLoading ? null : _openForgotPasswordSheet,
                        isLoading: isLoading,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _HeroBranding extends StatelessWidget {
  const _HeroBranding();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 32, 24, 0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.start,
        children: <Widget>[
          Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: Colors.white,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: const Icon(
              LucideIcons.heartPulse,
              color: AppColors.action,
              size: 36,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'مريض 360°',
            style: TextStyle(
              color: Colors.white,
              fontSize: 24,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            'لوحة المريض',
            style: TextStyle(
              color: Color(0xCCFFFFFF),
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );
  }
}

class _LoginCard extends StatelessWidget {
  const _LoginCard({
    required this.formKey,
    required this.emailController,
    required this.passwordController,
    required this.obscurePassword,
    required this.onToggleObscure,
    required this.onSubmit,
    required this.onForgotPassword,
    required this.isLoading,
  });

  final GlobalKey<FormState> formKey;
  final TextEditingController emailController;
  final TextEditingController passwordController;
  final bool obscurePassword;
  final VoidCallback onToggleObscure;
  final VoidCallback? onSubmit;
  final VoidCallback? onForgotPassword;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20),
      padding: const EdgeInsets.all(24),
      decoration: const BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadii.radiusXl,
        boxShadow: <BoxShadow>[
          BoxShadow(
            color: Color(0x1F0D3B3E),
            offset: Offset(0, 8),
            blurRadius: 28,
          ),
        ],
      ),
      child: Form(
        key: formKey,
        autovalidateMode: AutovalidateMode.onUserInteraction,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              'تسجيل الدخول',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            TextFormField(
              controller: emailController,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              textAlign: TextAlign.left,
              autofillHints: const <String>[AutofillHints.email],
              decoration: InputDecoration(
                labelText: 'البريد الإلكتروني',
                prefixIcon: const Icon(LucideIcons.mail),
                hintText: 'name@example.com',
                hintStyle: TextStyle(
                  color: AppColors.textSecondary.withValues(alpha: 0.6),
                ),
              ),
              validator: _validateEmail,
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: passwordController,
              obscureText: obscurePassword,
              textDirection: TextDirection.ltr,
              textAlign: TextAlign.left,
              autofillHints: const <String>[AutofillHints.password],
              decoration: InputDecoration(
                labelText: 'كلمة المرور',
                prefixIcon: const Icon(LucideIcons.lock),
                suffixIcon: IconButton(
                  icon: Icon(
                    obscurePassword ? LucideIcons.eye : LucideIcons.eyeOff,
                  ),
                  onPressed: onToggleObscure,
                  tooltip: obscurePassword
                      ? 'إظهار كلمة المرور'
                      : 'إخفاء كلمة المرور',
                ),
              ),
              validator: _validatePassword,
              onFieldSubmitted: (_) => onSubmit?.call(),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: AlignmentDirectional.centerEnd,
              child: TextButton(
                onPressed: onForgotPassword,
                child: const Text('نسيت كلمة المرور؟'),
              ),
            ),
            const SizedBox(height: 8),
            ElevatedButton(
              onPressed: onSubmit,
              child: isLoading
                  ? const SizedBox(
                      height: 22,
                      width: 22,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.4,
                        valueColor:
                            AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text('تسجيل الدخول'),
            ),
          ],
        ),
      ),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Forgot-password bottom sheet (3-step PageView)
// ═══════════════════════════════════════════════════════════════════════════

class ForgotPasswordSheet extends ConsumerStatefulWidget {
  const ForgotPasswordSheet({required this.initialEmail, super.key});

  final String initialEmail;

  @override
  ConsumerState<ForgotPasswordSheet> createState() =>
      _ForgotPasswordSheetState();
}

class _ForgotPasswordSheetState extends ConsumerState<ForgotPasswordSheet> {
  final PageController _pageController = PageController();
  late final TextEditingController _emailController;
  final TextEditingController _otpController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmController = TextEditingController();

  bool _requestingOtp = false;
  bool _resetting = false;
  bool _obscureNew = true;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController(text: widget.initialEmail);
  }

  @override
  void dispose() {
    _pageController.dispose();
    _emailController.dispose();
    _otpController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    final String email = _emailController.text.trim();
    if (email.isEmpty || _validateEmail(email) != null) {
      _showErrorSnack(context, 'الرجاء إدخال بريد إلكتروني صالح');
      return;
    }
    setState(() => _requestingOtp = true);
    try {
      await ref
          .read(authRepositoryProvider)
          .requestPasswordResetOtp(email);
      if (!mounted) return;
      await _pageController.animateToPage(
        1,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOut,
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnack(context, e.toDisplayMessage());
    } finally {
      if (mounted) setState(() => _requestingOtp = false);
    }
  }

  Future<void> _advanceToReset() async {
    if (_otpController.text.trim().length < 4) {
      _showErrorSnack(context, 'الرجاء إدخال رمز التحقق');
      return;
    }
    await _pageController.animateToPage(
      2,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOut,
    );
  }

  Future<void> _submitReset() async {
    final String newPassword = _passwordController.text;
    if (newPassword.length < 8) {
      _showErrorSnack(context, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (newPassword != _confirmController.text) {
      _showErrorSnack(context, 'كلمتا المرور غير متطابقتين');
      return;
    }
    setState(() => _resetting = true);
    try {
      await ref.read(authRepositoryProvider).verifyPasswordResetOtp(
            email: _emailController.text.trim(),
            otp: _otpController.text.trim(),
            newPassword: newPassword,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('تم تحديث كلمة المرور بنجاح. الرجاء تسجيل الدخول.'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      _showErrorSnack(context, e.toDisplayMessage());
    } finally {
      if (mounted) setState(() => _resetting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final double bottomInset = MediaQuery.of(context).viewInsets.bottom;
    return AnimatedPadding(
      duration: const Duration(milliseconds: 150),
      padding: EdgeInsets.only(bottom: bottomInset),
      child: DraggableScrollableSheet(
        initialChildSize: 0.85,
        minChildSize: 0.5,
        maxChildSize: 0.95,
        expand: false,
        builder: (BuildContext ctx, ScrollController scrollController) {
          return Container(
            decoration: const BoxDecoration(
              color: AppColors.card,
              borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(
              children: <Widget>[
                const SizedBox(height: 10),
                Container(
                  width: 42,
                  height: 4,
                  decoration: BoxDecoration(
                    color: AppColors.border,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
                const SizedBox(height: 10),
                Expanded(
                  child: PageView(
                    controller: _pageController,
                    physics: const NeverScrollableScrollPhysics(),
                    children: <Widget>[
                      _RequestOtpStep(
                        emailController: _emailController,
                        loading: _requestingOtp,
                        onSubmit: _requestOtp,
                        scrollController: scrollController,
                      ),
                      _EnterOtpStep(
                        otpController: _otpController,
                        email: _emailController.text.trim(),
                        onBack: () => _pageController.animateToPage(
                          0,
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut,
                        ),
                        onSubmit: _advanceToReset,
                        scrollController: scrollController,
                      ),
                      _SetNewPasswordStep(
                        passwordController: _passwordController,
                        confirmController: _confirmController,
                        obscureNew: _obscureNew,
                        onToggleObscure: () {
                          setState(() => _obscureNew = !_obscureNew);
                        },
                        loading: _resetting,
                        onSubmit: _submitReset,
                        onBack: () => _pageController.animateToPage(
                          1,
                          duration: const Duration(milliseconds: 220),
                          curve: Curves.easeOut,
                        ),
                        scrollController: scrollController,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _RequestOtpStep extends StatelessWidget {
  const _RequestOtpStep({
    required this.emailController,
    required this.loading,
    required this.onSubmit,
    required this.scrollController,
  });

  final TextEditingController emailController;
  final bool loading;
  final VoidCallback onSubmit;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      children: <Widget>[
        Text(
          'استعادة كلمة المرور',
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'أدخل بريدك الإلكتروني وسنرسل لك رمز تحقق لاستعادة كلمة المرور.',
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        TextField(
          controller: emailController,
          keyboardType: TextInputType.emailAddress,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          decoration: const InputDecoration(
            labelText: 'البريد الإلكتروني',
            prefixIcon: Icon(LucideIcons.mail),
          ),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: loading ? null : onSubmit,
          child: loading
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('إرسال رمز التحقق'),
        ),
      ],
    );
  }
}

class _EnterOtpStep extends StatelessWidget {
  const _EnterOtpStep({
    required this.otpController,
    required this.email,
    required this.onBack,
    required this.onSubmit,
    required this.scrollController,
  });

  final TextEditingController otpController;
  final String email;
  final VoidCallback onBack;
  final VoidCallback onSubmit;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      children: <Widget>[
        Text(
          'إدخال رمز التحقق',
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'أدخل الرمز المؤلف من 6 أرقام الذي أُرسل إلى $email',
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        TextField(
          controller: otpController,
          keyboardType: TextInputType.number,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.center,
          maxLength: 6,
          inputFormatters: <TextInputFormatter>[
            FilteringTextInputFormatter.digitsOnly,
          ],
          decoration: const InputDecoration(
            labelText: 'رمز التحقق',
            prefixIcon: Icon(LucideIcons.keyRound),
            counterText: '',
          ),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: onSubmit,
          child: const Text('متابعة'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: onBack,
          child: const Text('رجوع'),
        ),
      ],
    );
  }
}

class _SetNewPasswordStep extends StatelessWidget {
  const _SetNewPasswordStep({
    required this.passwordController,
    required this.confirmController,
    required this.obscureNew,
    required this.onToggleObscure,
    required this.loading,
    required this.onSubmit,
    required this.onBack,
    required this.scrollController,
  });

  final TextEditingController passwordController;
  final TextEditingController confirmController;
  final bool obscureNew;
  final VoidCallback onToggleObscure;
  final bool loading;
  final VoidCallback onSubmit;
  final VoidCallback onBack;
  final ScrollController scrollController;

  @override
  Widget build(BuildContext context) {
    return ListView(
      controller: scrollController,
      padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
      children: <Widget>[
        Text(
          'تعيين كلمة مرور جديدة',
          style: Theme.of(context).textTheme.titleLarge,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 8),
        Text(
          'اختر كلمة مرور قوية لا تقل عن 8 أحرف.',
          style: Theme.of(context).textTheme.bodyMedium,
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        TextField(
          controller: passwordController,
          obscureText: obscureNew,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          decoration: InputDecoration(
            labelText: 'كلمة المرور الجديدة',
            prefixIcon: const Icon(LucideIcons.lock),
            suffixIcon: IconButton(
              icon: Icon(obscureNew ? LucideIcons.eye : LucideIcons.eyeOff),
              onPressed: onToggleObscure,
            ),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: confirmController,
          obscureText: obscureNew,
          textDirection: TextDirection.ltr,
          textAlign: TextAlign.left,
          decoration: const InputDecoration(
            labelText: 'تأكيد كلمة المرور',
            prefixIcon: Icon(LucideIcons.lock),
          ),
        ),
        const SizedBox(height: 20),
        ElevatedButton(
          onPressed: loading ? null : onSubmit,
          child: loading
              ? const SizedBox(
                  height: 22,
                  width: 22,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.4,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : const Text('تحديث كلمة المرور'),
        ),
        const SizedBox(height: 8),
        OutlinedButton(
          onPressed: loading ? null : onBack,
          child: const Text('رجوع'),
        ),
      ],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Shared helpers
// ═══════════════════════════════════════════════════════════════════════════

String? _validateEmail(String? value) {
  final String v = value?.trim() ?? '';
  if (v.isEmpty) return 'الرجاء إدخال البريد الإلكتروني';
  final RegExp pattern = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  if (!pattern.hasMatch(v)) return 'البريد الإلكتروني غير صالح';
  return null;
}

String? _validatePassword(String? value) {
  if (value == null || value.isEmpty) return 'الرجاء إدخال كلمة المرور';
  if (value.length < 6) return 'كلمة المرور قصيرة جداً';
  return null;
}

void _showErrorSnack(BuildContext context, String message) {
  final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
  messenger
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        backgroundColor: AppColors.error,
        behavior: SnackBarBehavior.floating,
        content: Row(
          children: <Widget>[
            const Icon(LucideIcons.circleAlert, color: Colors.white),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(color: Colors.white),
              ),
            ),
          ],
        ),
      ),
    );
}
