import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ConsolidatedValidationModal } from '../components/SharedModals';

describe('V14 Core Regression Suite (Integration)', () => {
  it('Validation Lockout: Confirm & Generate is disabled for Unknown Origin artist', () => {
    const mockInvalidSeeds = [
      {
        id: 'seed-1',
        query: 'King of Everything',
        predictedOrigin: 'Unknown Origin',
        isKnownCacheHit: false
      }
    ];

    render(
      <ConsolidatedValidationModal 
        isOpen={true} 
        seeds={mockInvalidSeeds} 
        onConfirm={vi.fn()} 
        onCancel={vi.fn()} 
      />
    );
    
    // Check if the validation origin text renders Unknown Origin
    expect(screen.getByTestId('validation-origin-text')).toHaveTextContent('Unknown Origin');

    // Select the Confirm & Generate button
    const confirmBtn = screen.getByTestId('validation-confirm-button');
    
    // Assert that the button is strictly disabled
    expect(confirmBtn).toBeDisabled();
    expect(confirmBtn).toHaveClass('opacity-50 cursor-not-allowed');
  });

  it('Validation Lockout: Confirm & Generate is enabled for valid origin artist', () => {
    const mockValidSeeds = [
      {
        id: 'seed-2',
        query: 'Nirvana',
        predictedOrigin: 'USA',
        isKnownCacheHit: true
      }
    ];

    render(
      <ConsolidatedValidationModal 
        isOpen={true} 
        seeds={mockValidSeeds} 
        onConfirm={vi.fn()} 
        onCancel={vi.fn()} 
      />
    );

    // Select the Confirm & Generate button
    const confirmBtn = screen.getByTestId('validation-confirm-button');
    
    // Assert that the button is enabled
    expect(confirmBtn).not.toBeDisabled();
  });
});
