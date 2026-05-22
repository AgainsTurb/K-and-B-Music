// src/hooks/useTheme.ts
import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export function useTheme() {
    const [theme, setTheme] = useState<Theme>(() => {
        return (localStorage.getItem('app_theme') as Theme) || 'system';
    });

    // Track the actual system preference to dynamically update if set to "system"
    const [systemPrefersDark, setSystemPrefersDark] = useState(() => 
        window.matchMedia('(prefers-color-scheme: dark)').matches
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    // The absolute truth of whether the app should be dark right now
    const isDark = theme === 'dark' || (theme === 'system' && systemPrefersDark);

    useEffect(() => {
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.body.style.backgroundColor = '#111827'; // gray-900
            document.body.style.color = '#f3f4f6'; // gray-100
        } else {
            document.documentElement.classList.remove('dark');
            document.body.style.backgroundColor = '#ffffff';
            document.body.style.color = '#1f2937'; // gray-800
        }
        localStorage.setItem('app_theme', theme);
    }, [theme, isDark]);

    return { theme, setTheme, isDark }; // <-- Exporting isDark
}