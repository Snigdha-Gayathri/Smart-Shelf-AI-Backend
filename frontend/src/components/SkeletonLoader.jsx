import React from 'react'

/**
 * SkeletonLoader — Shimmer loading placeholders for book cards.
 * Replaces blank states / QuantumLoader in card grids.
 *
 * Usage: <SkeletonLoader count={6} variant="card" />
 *        <SkeletonLoader variant="detail" />
 */

function ShimmerBlock({ className = '', style = {} }) {
  return (
    <div
      className={`skeleton-shimmer rounded ${className}`}
      style={{ ...style }}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-4 sm:p-5 flex flex-col skeleton-card">
      <div className="flex gap-4">
        {/* Cover */}
        <ShimmerBlock className="w-32 h-48 rounded-lg shrink-0" />
        {/* Info */}
        <div className="flex flex-col flex-1 gap-2 pt-1">
          <ShimmerBlock className="h-4 w-16 rounded-full" />
          <ShimmerBlock className="h-5 w-full rounded" />
          <ShimmerBlock className="h-5 w-3/4 rounded" />
          <ShimmerBlock className="h-3 w-1/2 rounded" />
          <div className="flex gap-1.5 mt-auto">
            <ShimmerBlock className="h-5 w-14 rounded-full" />
            <ShimmerBlock className="h-5 w-16 rounded-full" />
          </div>
        </div>
      </div>
      <ShimmerBlock className="h-3 w-full rounded mt-3" />
      <ShimmerBlock className="h-3 w-5/6 rounded mt-1.5" />
      <ShimmerBlock className="h-9 w-full rounded-md mt-4" />
    </div>
  )
}

function SkeletonDetail() {
  return (
    <div className="rounded-2xl p-6 skeleton-card">
      <ShimmerBlock className="h-6 w-48 rounded mb-4" />
      <div className="flex gap-6">
        <ShimmerBlock className="w-40 h-56 rounded-lg shrink-0" />
        <div className="flex flex-col flex-1 gap-3">
          <ShimmerBlock className="h-4 w-full rounded" />
          <ShimmerBlock className="h-4 w-5/6 rounded" />
          <ShimmerBlock className="h-4 w-2/3 rounded" />
          <ShimmerBlock className="h-10 w-32 rounded-md mt-auto" />
        </div>
      </div>
    </div>
  )
}

export default function SkeletonLoader({ count = 3, variant = 'card' }) {
  if (variant === 'detail') {
    return <SkeletonDetail />
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
