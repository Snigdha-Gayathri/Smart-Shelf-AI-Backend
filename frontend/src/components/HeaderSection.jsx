import React from 'react';

export default function HeaderSection({ theme }) {
  return (
    <header className="w-full py-4 sm:py-8 md:py-10 flex flex-col items-center justify-center px-3 sm:px-4">
      <div className="mb-2 sm:mb-3 md:mb-4">
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-cool-blue dark:text-cool-blue tracking-tight text-center">Smart Shelf AI</h1>
      </div>
      <p className="text-sm sm:text-base md:text-lg lg:text-xl text-on-light max-w-2xl text-center leading-relaxed">
        Your emotion-aware quantum book curator
      </p>
    </header>
  );
}
