import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_exception.dart';
import '../../../shared/widgets/app_drawer.dart';
import '../../../shared/widgets/error_snackbar.dart';
import '../../../shared/widgets/page_header.dart';
import '../../auth/domain/auth_session.dart';
import '../../auth/presentation/providers/auth_provider.dart';
import '../domain/overview.dart';
import 'providers/home_providers.dart';
import 'widgets/hero_card.dart';
import 'widgets/kpi_grid.dart';
import 'widgets/quick_actions_card.dart';
import 'widgets/recent_activity_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Overview> overviewAsync = ref.watch(
      dashboardOverviewProvider,
    );
    final AsyncValue<AuthSession?> authState = ref.watch(
      authControllerProvider,
    );
    final AuthSession? session = authState.value;
    final String? firstName =
        session?.person?.firstName ?? session?.child?.firstName;

    ref.listen<AsyncValue<Overview>>(dashboardOverviewProvider, (
      AsyncValue<Overview>? prev,
      AsyncValue<Overview> next,
    ) {
      if (next.hasError && prev?.hasError != true) {
        final Object err = next.error!;
        final String msg = err is ApiException
            ? err.toDisplayMessage()
            : err.toString();
        ErrorSnackbar.show(
          context,
          'تعذر تحميل لوحة القيادة',
          msg,
          onRetry: () => ref.invalidate(dashboardOverviewProvider),
        );
      }
    });

    final Overview overview = overviewAsync.value ?? Overview.empty;
    final bool isLoading = overviewAsync.isLoading && !overviewAsync.hasValue;

    return Scaffold(
      appBar: PageHeader(
        title: 'الرئيسية',
        subtitle: 'نظرة عامة على صحتك',
        unreadCount: overview.unreadNotifications,
      ),
      drawer: const AppDrawer(),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(dashboardOverviewProvider);
          await ref.read(dashboardOverviewProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          children: <Widget>[
            HeroCard(firstName: firstName),
            const SizedBox(height: 16),
            KpiGrid(overview: overview, isLoading: isLoading),
            const SizedBox(height: 16),
            RecentActivityCard(
              activities: overview.recentActivity,
              isLoading: isLoading,
            ),
            const SizedBox(height: 16),
            const QuickActionsCard(),
          ],
        ),
      ),
    );
  }
}
