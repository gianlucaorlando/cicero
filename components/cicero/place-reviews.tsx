'use client';

import { useState } from 'react';
import { ExternalLink, Flag, Languages, RefreshCw, Star } from 'lucide-react';

import { usePlaceReviews } from '@/hooks/use-place-reviews';
import { formatRating, humanReviewCount, relativeTimeLabel } from '@/lib/format';
import { latestReviews } from '@/lib/reviews';
import type { PlaceReview } from '@/lib/types';

/** Longer reviews open on request, so the sheet stays short on a phone. */
const CLAMP_CHARACTERS = 260;

const SOURCE_LABEL: Record<PlaceReview['source'], string> = { google: 'Google', tripadvisor: 'Tripadvisor' };

function Stars({ rating }: { rating: number }) {
  return (
    <>
      <span className="place-review-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((value) => <Star key={value} className={value <= Math.round(rating) ? 'filled' : ''} />)}
      </span>
      <span className="sr-only">{rating} stelle su 5</span>
    </>
  );
}

function ReviewItem({ review }: { review: PlaceReview }) {
  const [expanded, setExpanded] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const body = showOriginal && review.originalText ? review.originalText : review.text;
  const long = body.length > CLAMP_CHARACTERS;
  const when = review.source === 'google' && review.relativeTime
    ? review.relativeTime
    : review.publishedAt ? relativeTimeLabel(review.publishedAt) : null;
  const date = review.publishedAt ? new Date(review.publishedAt).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : undefined;

  return (
    <li className={`place-review ${review.source}`}>
      <div className="place-review-head">
        {review.authorPhotoUri ? (
          // Google asks to credit authors with their avatar, name and profile link.
          // oxlint-disable-next-line next/no-img-element
          <img className="place-review-avatar" src={review.authorPhotoUri} alt="" width={32} height={32} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="place-review-avatar" aria-hidden="true">{review.author.charAt(0).toLocaleUpperCase('it')}</span>
        )}
        <span className="place-review-who">
          {review.authorUri
            ? <a href={review.authorUri} target="_blank" rel="noreferrer">{review.author}</a>
            : <strong>{review.author}</strong>}
          <small>
            {review.rating != null && <Stars rating={review.rating} />}
            {when && <time dateTime={review.publishedAt ?? undefined} title={date}>{when}</time>}
            <span className={`place-review-source ${review.source}`}>{SOURCE_LABEL[review.source]}</span>
          </small>
        </span>
      </div>
      {review.title && <strong className="place-review-title">{review.title}</strong>}
      <p className={`place-review-text ${long && !expanded ? 'clamped' : ''}`}>{body}</p>
      <div className="place-review-actions">
        {long && (
          <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
            {expanded ? 'Mostra meno' : 'Leggi tutto'}
          </button>
        )}
        {review.originalText && (
          <button type="button" onClick={() => setShowOriginal((value) => !value)}>
            <Languages aria-hidden="true" /> {showOriginal ? 'Traduzione' : 'Originale'}
          </button>
        )}
        {review.reviewUri && (
          <a href={review.reviewUri} target="_blank" rel="noreferrer">
            {review.source === 'google' ? 'Su Google Maps' : 'Su Tripadvisor'} <ExternalLink aria-hidden="true" />
          </a>
        )}
        {review.flagUri && (
          <a href={review.flagUri} target="_blank" rel="noreferrer" aria-label={`Segnala la recensione di ${review.author}`}>
            <Flag aria-hidden="true" /> Segnala
          </a>
        )}
      </div>
    </li>
  );
}

/** The latest reviews of a place, from Google and (when configured) Tripadvisor, newest first. */
export function PlaceReviewsSection({ placeId }: { placeId: string }) {
  const { status, data, retry } = usePlaceReviews(placeId);
  const reviews = latestReviews(data);
  const tripadvisor = data?.tripadvisor ?? null;

  return (
    <section className="place-reviews" aria-labelledby={`reviews-${placeId}`} aria-busy={status === 'loading'}>
      <header>
        <h3 id={`reviews-${placeId}`}>Recensioni recenti</h3>
        {/* Google requires saying how its reviews were chosen and ordered. */}
        <small>
          Dalla più recente. Google ne fornisce fino a 5, scelte per pertinenza
          {tripadvisor ? '; Tripadvisor le sue ultime.' : '.'}
        </small>
      </header>

      {status === 'loading' && (
        <ol className="place-review-list" aria-hidden="true">
          {[0, 1].map((index) => <li key={index} className="place-review skeleton"><span /><span /><span /></li>)}
        </ol>
      )}

      {status === 'error' && (
        <button className="place-reviews-retry" type="button" onClick={retry}>
          <RefreshCw aria-hidden="true" /> Recensioni non disponibili ora. Riprova
        </button>
      )}

      {status === 'ready' && (reviews.length ? (
        <ol className="place-review-list">
          {reviews.map((review) => <ReviewItem key={review.id} review={review} />)}
        </ol>
      ) : <p className="place-reviews-empty">Ancora nessuna recensione per questo posto.</p>)}

      {status === 'ready' && data && (
        <div className="place-reviews-sources">
          {data.google?.url && (
            <a href={data.google.url} target="_blank" rel="noreferrer">
              Tutte su Google Maps{data.google.count ? ` (${humanReviewCount(data.google.count)})` : ''} <ExternalLink aria-hidden="true" />
            </a>
          )}
          {tripadvisor?.url && (
            <a href={tripadvisor.url} target="_blank" rel="noreferrer">
              Tripadvisor{tripadvisor.rating != null ? ` ${formatRating(tripadvisor.rating)}` : ''}
              {tripadvisor.count ? ` (${humanReviewCount(tripadvisor.count)})` : ''} <ExternalLink aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      <p className="google-attribution">Recensioni da <strong>Google Maps</strong>{tripadvisor ? <> e <strong>Tripadvisor</strong></> : null}</p>
    </section>
  );
}
