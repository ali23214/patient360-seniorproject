import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' as intl;
import 'package:lucide_icons_flutter/lucide_icons.dart';

import '../../../core/network/api_exception.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_spinner.dart';
import '../../../shared/widgets/page_header.dart';
import '../../../shared/widgets/primary_button.dart';
import '../domain/app_notification.dart';
import '../domain/notification_type_meta.dart';
import 'providers/notifications_provider.dart';

enum _NotifTab { unread, all }

/// Top-level /notifications surface. Two tabs (unread vs everything) and
/// an optimistic mark-read on tap that also deep-links into the related
/// section when [relatedTypeToRoute] knows about the type.
class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  _NotifTab _tab = _NotifTab.unread;

  Future<void> _onTap(AppNotification n) async {
    // Optimistic update — fire-and-forget the API call. The provider
    // reverts the local state if the network call eventually fails.
    if (!n.isRead) {
      // ignore: unawaited_futures
      ref.read(notificationsProvider.notifier).markRead(n.id);
    }
    final String? route = routeForRelatedType(n.relatedType);
    if (route != null && mounted) {
      context.go(route);
    }
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<AppNotification>> async = ref.watch(
      notificationsProvider,
    );
    final int unread = ref.watch(unreadNotificationsCountProvider);

    return Scaffold(
      appBar: PageHeader(
        title: 'الإشعارات',
        subtitle: 'التنبيهات والتذكيرات',
        unreadCount: unread,
      ),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            child: _TabBar(
              current: _tab,
              onChange: (_NotifTab t) => setState(() => _tab = t),
            ),
          ),
          Expanded(
            child: async.when(
              loading: () =>
                  const LoadingSpinner(message: 'جاري تحميل الإشعارات....'),
              error: (Object err, _) => _ErrorView(
                error: err,
                onRetry: () =>
                    ref.read(notificationsProvider.notifier).refresh(),
              ),
              data: (List<AppNotification> all) {
                final List<AppNotification> bucket = _tab == _NotifTab.unread
                    ? all.where((AppNotification n) => !n.isRead).toList()
                    : all;
                if (bucket.isEmpty) {
                  return _EmptyForTab(tab: _tab);
                }
                return RefreshIndicator(
                  onRefresh: () =>
                      ref.read(notificationsProvider.notifier).refresh(),
                  child: ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
                    itemCount: bucket.length,
                    itemBuilder: (BuildContext _, int i) => NotificationItem(
                      notification: bucket[i],
                      onTap: () => _onTap(bucket[i]),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _TabBar extends StatelessWidget {
  const _TabBar({required this.current, required this.onChange});
  final _NotifTab current;
  final ValueChanged<_NotifTab> onChange;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border.all(color: scheme.outline),
      ),
      child: Row(
        children: <Widget>[
          Expanded(
            child: _TabButton(
              label: 'غير المقروءة',
              selected: current == _NotifTab.unread,
              onTap: () => onChange(_NotifTab.unread),
            ),
          ),
          Expanded(
            child: _TabButton(
              label: 'الكل',
              selected: current == _NotifTab.all,
              onTap: () => onChange(_NotifTab.all),
            ),
          ),
        ],
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? AppColors.action : Colors.transparent,
      borderRadius: AppRadii.radiusMd,
      child: InkWell(
        borderRadius: AppRadii.radiusMd,
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          child: Text(
            label,
            style: TextStyle(
              color: selected ? Colors.white : scheme.onSurfaceVariant,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

/// One notification row. Priority drives the leading-edge border weight —
/// urgent gets a 4px error stripe, high gets 3px warning, lower priorities
/// rely on the type-color tint alone.
class NotificationItem extends StatelessWidget {
  const NotificationItem({
    required this.notification,
    required this.onTap,
    super.key,
  });

  final AppNotification notification;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ColorScheme scheme = Theme.of(context).colorScheme;
    final NotificationTypeMeta meta = NotificationTypeMeta.metaFor(
      notification.type,
    );
    final bool unread = !notification.isRead;
    final String? route = routeForRelatedType(notification.relatedType);

    final BorderSide priorityBorder = _borderForPriority(notification.priority);

    return Container(
      margin: const EdgeInsets.symmetric(vertical: 4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: AppRadii.radiusLg,
        border: Border(
          top: BorderSide(color: scheme.outline),
          bottom: BorderSide(color: scheme.outline),
          right: BorderSide(color: scheme.outline),
          left: priorityBorder,
        ),
      ),
      child: InkWell(
        borderRadius: AppRadii.radiusLg,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: meta.color.withValues(alpha: 0.18),
                  borderRadius: AppRadii.radiusMd,
                ),
                alignment: Alignment.center,
                child: Icon(meta.icon, size: 18, color: meta.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Flexible(
                          child: Text(
                            meta.arabicLabel,
                            style: Theme.of(context).textTheme.labelMedium
                                ?.copyWith(
                                  color: meta.color,
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                        ),
                        if (unread) ...<Widget>[
                          const SizedBox(width: 6),
                          const _UnreadDot(),
                        ],
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (notification.title.isNotEmpty)
                      Text(
                        notification.title,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    if (notification.message.isNotEmpty) ...<Widget>[
                      const SizedBox(height: 2),
                      Text(
                        notification.message,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                    ],
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        Icon(
                          LucideIcons.clock,
                          size: 12,
                          color: scheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          intl.DateFormat(
                            'yyyy-MM-dd HH:mm',
                          ).format(notification.createdAt),
                          textDirection: TextDirection.ltr,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(color: scheme.onSurfaceVariant),
                        ),
                        if (route != null) ...<Widget>[
                          const Spacer(),
                          Text(
                            'اضغط لعرض التفاصيل',
                            style: Theme.of(context).textTheme.labelSmall
                                ?.copyWith(color: AppColors.action),
                          ),
                          const SizedBox(width: 4),
                          const Icon(
                            LucideIcons.chevronLeft,
                            size: 14,
                            color: AppColors.action,
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static BorderSide _borderForPriority(String priority) {
    switch (priority) {
      case 'urgent':
        return const BorderSide(color: AppColors.error, width: 4);
      case 'high':
        return const BorderSide(color: AppColors.warning, width: 3);
      default:
        return const BorderSide(color: Colors.transparent);
    }
  }
}

class _UnreadDot extends StatelessWidget {
  const _UnreadDot();
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 8,
      height: 8,
      decoration: const BoxDecoration(
        color: AppColors.action,
        shape: BoxShape.circle,
      ),
    );
  }
}

class _EmptyForTab extends StatelessWidget {
  const _EmptyForTab({required this.tab});
  final _NotifTab tab;

  @override
  Widget build(BuildContext context) {
    final String subtitle = tab == _NotifTab.unread
        ? 'لا توجد إشعارات غير مقروءة.'
        : 'سنبلغك بالتحديثات هنا.';
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: EmptyState(
          icon: LucideIcons.bell,
          title: 'لا توجد إشعارات',
          subtitle: subtitle,
        ),
      ),
    );
  }
}

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
              title: 'تعذر تحميل الإشعارات',
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
