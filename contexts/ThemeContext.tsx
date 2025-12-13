import React, { createContext, useContext, useState, useEffect } from 'react';

export type Theme = 'default' | 'monochrome' | 'high-contrast' | 'ocean' | 'sunset' | 'forest';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const themeClasses: Record<Theme, string> = {
  'default': 'from-indigo-900 via-purple-900 to-fuchsia-900',
  'monochrome': 'from-gray-800 via-gray-900 to-black',
  'high-contrast': 'from-yellow-400 via-orange-500 to-red-600',
  'ocean': 'from-blue-600 via-cyan-500 to-teal-600',
  'sunset': 'from-orange-500 via-pink-500 to-red-500',
  'forest': 'from-green-700 via-emerald-600 to-teal-700'
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => {
    const saved = localStorage.getItem('popquiz-theme');
    return (saved as Theme) || 'default';
  });

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('popquiz-theme', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div className={`min-h-screen bg-gradient-to-br ${themeClasses[theme]}`}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};

export { themeClasses };

