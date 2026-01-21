'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

export type FontSize = 'normal' | 'large' | 'xl';

const STORAGE_KEY = 'vmp_font_size';

interface FontSizeContextType {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  isHydrated: boolean;
}

const FontSizeContext = createContext<FontSizeContextType | undefined>(undefined);

// Font size class mapping
const FONT_SIZE_CLASSES: Record<FontSize, string> = {
  normal: 'font-size-normal',
  large: 'font-size-large',
  xl: 'font-size-xl',
};

interface FontSizeProviderProps {
  children: ReactNode;
}

export function FontSizeProvider({ children }: FontSizeProviderProps) {
  const [fontSize, setFontSizeState] = useState<FontSize>('normal');
  const [isHydrated, setIsHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && (stored === 'normal' || stored === 'large' || stored === 'xl')) {
        setFontSizeState(stored as FontSize);
      }
    } catch (error) {
      console.error('Failed to load font size preference:', error);
    }
    setIsHydrated(true);
  }, []);

  // Apply class to document element
  useEffect(() => {
    if (!isHydrated) return;

    const root = document.documentElement;

    // Remove all font size classes
    Object.values(FONT_SIZE_CLASSES).forEach((cls) => {
      root.classList.remove(cls);
    });

    // Add the current font size class
    root.classList.add(FONT_SIZE_CLASSES[fontSize]);
  }, [fontSize, isHydrated]);

  // Save to localStorage when changed
  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    try {
      localStorage.setItem(STORAGE_KEY, size);
    } catch (error) {
      console.error('Failed to save font size preference:', error);
    }
  }, []);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, isHydrated }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize(): FontSizeContextType {
  const context = useContext(FontSizeContext);
  if (context === undefined) {
    throw new Error('useFontSize must be used within a FontSizeProvider');
  }
  return context;
}

// Export the classes for use in layout
export { FONT_SIZE_CLASSES };
