import React, { useEffect, useState } from 'react';
import ArtistPage from './ArtistPage';
import { syncFromDiscography } from '../adapter.js';

/**
 * AurafyApp - Main Aurafy application component
 * @param {Object} props
 * @param {Object} props.gameState - Current game state
 * @param {Object} props.aurafyState - Current Aurafy state
 * @param {Function} props.onBack - Back button handler
 */
const AurafyApp = ({ gameState, aurafyState, onBack }) => {
  const [initializedAurafyState, setInitializedAurafyState] = useState(aurafyState);
  const [isInitializing, setIsInitializing] = useState(false);

  // Initialize Aurafy data if needed
  useEffect(() => {
    const initializeAurafy = async () => {
      // Check if we need to initialize
      if (!initializedAurafyState || 
          !initializedAurafyState.artists || 
          !initializedAurafyState.artists.player ||
          Object.keys(initializedAurafyState.tracks || {}).length === 0) {
        
        setIsInitializing(true);
        try {
          console.log('Initializing Aurafy data...');
          const syncedState = syncFromDiscography(gameState, initializedAurafyState || {});
          console.log('Synced Aurafy state:', syncedState);
          setInitializedAurafyState(syncedState);
        } catch (error) {
          console.error('Failed to initialize Aurafy:', error);
        } finally {
          setIsInitializing(false);
        }
      }
    };

    initializeAurafy();
  }, [gameState, initializedAurafyState]);

  if (isInitializing) {
    return (
      <div className="bg-gray-900 max-w-md mx-auto min-h-screen flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🎵</div>
          <div className="text-white text-lg mb-2">Initializing Aurafy...</div>
          <div className="text-gray-400 text-sm">Syncing your discography</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 max-w-md mx-auto min-h-screen">
      {/* Mobile Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 p-4 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden">
              <img 
                src="/assets/aurafy/aurafy-icon.png" 
                alt="Aurafy"
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
              <span className="text-blue-600 font-bold text-xl hidden">A</span>
            </div>
            <h1 className="text-xl font-bold text-white">Aurafy</h1>
          </div>
          
          <button
            onClick={onBack}
            className="px-3 py-2 bg-white/20 text-white rounded-lg hover:bg-white/30 transition-colors text-sm"
          >
            ← Back
          </button>
        </div>
      </div>
      
      {/* Main Content */}
      <ArtistPage
        gameState={gameState}
        aurafyState={initializedAurafyState}
        onBack={onBack}
      />
    </div>
  );
};

export default AurafyApp;
