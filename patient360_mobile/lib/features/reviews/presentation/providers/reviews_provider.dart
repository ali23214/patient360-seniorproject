import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/reviews_repository.dart';
import '../../domain/review.dart';

class ReviewsController extends AsyncNotifier<List<Review>> {
  @override
  Future<List<Review>> build() async {
    return ref.read(reviewsRepositoryProvider).getMyReviews();
  }

  Future<void> refresh() async {
    state = const AsyncValue<List<Review>>.loading();
    state = await AsyncValue.guard<List<Review>>(
      () => ref.read(reviewsRepositoryProvider).getMyReviews(),
    );
  }

  /// Submits [dto] and prepends the result to the cached list. Errors
  /// bubble to the caller so the submit sheet can show its own SnackBar.
  Future<Review> submit(ReviewSubmitDto dto) async {
    final Review created =
        await ref.read(reviewsRepositoryProvider).submitReview(dto);
    final List<Review> current = state.value ?? <Review>[];
    state = AsyncValue<List<Review>>.data(<Review>[created, ...current]);
    return created;
  }
}

final AsyncNotifierProvider<ReviewsController, List<Review>>
    reviewsProvider =
    AsyncNotifierProvider<ReviewsController, List<Review>>(
  ReviewsController.new,
);
