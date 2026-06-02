/**
 * Color Constants for Theme-Aware UI
 * Centralized color definitions to ensure consistency across light/dark modes
 */

// Status Colors - for badges, indicators, and status displays
export const STATUS_COLORS = {
    PENDING: {
        bg: 'bg-amber-50 dark:bg-amber-900/30',
        text: 'text-amber-800 dark:text-amber-200',
        border: 'border-amber-200 dark:border-amber-700',
        shadow: 'shadow-[0_0_12px_rgba(251,191,36,0.5)] dark:shadow-[0_0_12px_rgba(180,83,9,0.5)]',
        badge: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-100',
    },
    APPROVED: {
        bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        text: 'text-emerald-800 dark:text-emerald-200',
        border: 'border-emerald-200 dark:border-emerald-700',
        shadow: 'shadow-[0_0_12px_rgba(16,185,129,0.5)] dark:shadow-[0_0_12px_rgba(5,150,105,0.5)]',
        badge: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100',
    },
    REJECTED: {
        bg: 'bg-rose-50 dark:bg-rose-900/30',
        text: 'text-rose-800 dark:text-rose-200',
        border: 'border-rose-200 dark:border-rose-700',
        shadow: 'shadow-[0_0_12px_rgba(244,63,94,0.5)] dark:shadow-[0_0_12px_rgba(190,24,93,0.5)]',
        badge: 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-100',
    },
    UPDATING: {
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        text: 'text-blue-800 dark:text-blue-200',
        border: 'border-blue-200 dark:border-blue-700',
        shadow: 'shadow-[0_0_12px_rgba(59,130,246,0.5)] dark:shadow-[0_0_12px_rgba(37,99,235,0.5)]',
        badge: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100',
    },
    SUCCESS: {
        bg: 'bg-green-50 dark:bg-green-900/30',
        text: 'text-green-800 dark:text-green-200',
        border: 'border-green-200 dark:border-green-700',
        shadow: 'shadow-[0_0_12px_rgba(34,197,94,0.5)] dark:shadow-[0_0_12px_rgba(22,163,74,0.5)]',
        badge: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100',
    },
    ERROR: {
        bg: 'bg-red-50 dark:bg-red-900/30',
        text: 'text-red-800 dark:text-red-200',
        border: 'border-red-200 dark:border-red-700',
        shadow: 'shadow-[0_0_12px_rgba(239,68,68,0.5)] dark:shadow-[0_0_12px_rgba(220,38,38,0.5)]',
        badge: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-100',
    },
    WARNING: {
        bg: 'bg-yellow-50 dark:bg-yellow-900/30',
        text: 'text-yellow-800 dark:text-yellow-200',
        border: 'border-yellow-200 dark:border-yellow-700',
        shadow: 'shadow-[0_0_12px_rgba(234,179,8,0.5)] dark:shadow-[0_0_12px_rgba(202,138,4,0.5)]',
        badge: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100',
    },
} as const;

// Button Colors
export const BUTTON_COLORS = {
    PRIMARY: 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 dark:from-orange-700 dark:to-orange-600 dark:hover:from-orange-600 dark:hover:to-orange-500 text-white',
    SECONDARY: 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 dark:from-blue-700 dark:to-blue-600 dark:hover:from-blue-600 dark:hover:to-blue-500 text-white',
    DANGER: 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 dark:from-red-700 dark:to-red-600 dark:hover:from-red-600 dark:hover:to-red-500 text-white',
    SUCCESS: 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 dark:from-green-700 dark:to-green-600 dark:hover:from-green-600 dark:hover:to-green-500 text-white',
} as const;

// Chart Colors - for data visualization
export const CHART_COLORS = {
    CHECKED_IN: '#10b981', // emerald-500
    CHECKED_OUT: '#8b5cf6', // violet-500
    NOT_CHECKED_IN: '#f59e0b', // amber-500
    DARK_CHECKED_IN: '#059669', // emerald-700
    DARK_CHECKED_OUT: '#7c3aed', // violet-700
    DARK_NOT_CHECKED_IN: '#d97706', // amber-600
} as const;

// Modal/Card Colors
export const MODAL_COLORS = {
    LIGHT: {
        bg: 'bg-white',
        text: 'text-slate-900',
        border: 'border-slate-200',
        shadow: 'shadow-2xl',
    },
    DARK: {
        bg: 'dark:bg-slate-900',
        text: 'dark:text-white',
        border: 'dark:border-slate-800',
        shadow: 'dark:shadow-2xl dark:shadow-slate-950',
    },
} as const;

// Text Colors - light/dark safe combinations
export const TEXT_COLORS = {
    PRIMARY: 'text-slate-900 dark:text-white',
    SECONDARY: 'text-slate-600 dark:text-slate-300',
    MUTED: 'text-slate-500 dark:text-slate-400',
    LIGHT: 'text-slate-400 dark:text-slate-500',
} as const;

// Background Colors
export const BACKGROUND_COLORS = {
    PRIMARY: 'bg-white dark:bg-slate-950',
    SECONDARY: 'bg-slate-50 dark:bg-slate-900',
    TERTIARY: 'bg-slate-100 dark:bg-slate-800',
    OVERLAY: 'bg-black/50 dark:bg-black/70',
} as const;

// Loading Spinner Colors
export const SPINNER_COLORS = {
    PRIMARY: 'border-b-4 border-orange-600 dark:border-b-4 dark:border-orange-500',
    SECONDARY: 'border-4 border-blue-600/20 border-t-blue-600 dark:border-4 dark:border-blue-700/20 dark:border-t-blue-500',
} as const;

export default {
    STATUS_COLORS,
    BUTTON_COLORS,
    CHART_COLORS,
    MODAL_COLORS,
    TEXT_COLORS,
    BACKGROUND_COLORS,
    SPINNER_COLORS,
};
