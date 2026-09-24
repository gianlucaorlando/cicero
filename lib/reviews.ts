import type { PlaceReview, PlaceReviews } from '@/lib/types';

/** Newest first; undated reviews last, in the order the source gave them. */
export function newestFirst(reviews: PlaceReview[]) {
  return reviews
    .map((review, index) => ({ review, index, time: review.publishedAt ? Date.parse(review.publishedAt) : Number.NEGATIVE_INFINITY }))
    .sort((left, right) => right.time - left.time || left.index - right.index)
    .map(({ review }) => review);
}

/** Google and Tripadvisor in one list, the latest first. */
export function latestReviews(reviews: PlaceReviews | null) {
  if (!reviews) return [];
  return newestFirst([...(reviews.google?.reviews ?? []), ...(reviews.tripadvisor?.reviews ?? [])]);
}
