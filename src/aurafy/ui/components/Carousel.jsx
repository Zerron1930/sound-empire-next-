import React, { useRef, useState } from 'react';

/**
 * Carousel - Horizontal scroller with snap cards
 * @param {Object} props
 * @param {Array} props.items - Array of items to display
 * @param {Function} props.renderItem - Function to render each item
 * @param {string} props.title - Carousel title
 * @param {string} props.className - Additional CSS classes
 * @param {number} props.itemsPerRow - Number of items per row (default: 3)
 */
const Carousel = ({ items, renderItem, title, className = '', itemsPerRow = 3 }) => {
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
    }
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = scrollRef.current.clientWidth;
      const newScrollLeft = scrollRef.current.scrollLeft + (direction === 'left' ? -scrollAmount : scrollAmount);
      
      scrollRef.current.scrollTo({
        left: newScrollLeft,
        behavior: 'smooth'
      });
    }
  };

  if (!items || items.length === 0) {
    return (
      <div className={`mb-8 ${className}`}>
        <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
        <div className="text-gray-400 text-center py-8">
          No {title.toLowerCase()} available yet
        </div>
      </div>
    );
  }

  return (
    <div className={`mb-6 ${className}`}>
      <h2 className="text-lg font-bold text-white mb-4">{title}</h2>
      
      <div className="relative group">
        {/* Scroll Buttons - Mobile */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/70 text-white rounded-full flex items-center justify-center opacity-100 transition-opacity hover:bg-black/90 text-sm"
          >
            ‹
          </button>
        )}
        
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-black/70 text-white rounded-full flex items-center justify-center opacity-100 transition-opacity hover:bg-black/90 text-sm"
          >
            ›
          </button>
        )}
        
        {/* Scrollable Container - Mobile */}
        <div
          ref={scrollRef}
          onScroll={checkScrollButtons}
          className="flex gap-3 overflow-x-auto scrollbar-hide snap-x snap-mandatory"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none'
          }}
        >
          {items.map((item, index) => {
            const itemWidth = itemsPerRow === 1 ? '100%' : 
                             itemsPerRow === 2 ? 'calc(50% - 0.375rem)' : 
                             'calc(33.333% - 0.5rem)';
            return (
              <div
                key={item.id || index}
                className="flex-shrink-0 snap-start"
                style={{ width: itemWidth }}
              >
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
        
        {/* Scrollbar Hide CSS */}
        <style>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>
    </div>
  );
};

export default Carousel;
