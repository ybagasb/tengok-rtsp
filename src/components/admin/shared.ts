import axios from 'axios';


// Shared animation variants for Framer Motion across all admin pages
export const containerVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.07 }
    }
};

export const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.97 },
    show: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
};

export const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: {
        opacity: 1,
        y: 0,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
};

export const sidebarVariants = {
    hidden: { x: -20, opacity: 0 },
    show: {
        x: 0,
        opacity: 1,
        transition: { staggerChildren: 0.07, delayChildren: 0.15 }
    }
};

export const navItemVariants = {
    hidden: { x: -16, opacity: 0 },
    show: { x: 0, opacity: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};

// Standard input class for admin forms
export const inputCls = (hasIcon = false) =>
    `w-full bg-black/40 border border-white/10 rounded-xl ${hasIcon ? 'py-3.5 pl-11 pr-4' : 'p-4'} text-sm text-white focus:border-yellow-500/40 focus:ring-1 focus:ring-yellow-500/40 outline-none transition-all placeholder:text-slate-600`;

export const selectCls =
    'w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white focus:border-yellow-500/40 focus:ring-1 focus:ring-yellow-500/40 outline-none transition-all appearance-none cursor-pointer';

// Safely extract a message from an unknown caught value
export const getErrorMessage = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

// Extract `error` field from an Axios error response (undefined for other errors)
export const getApiError = (e: unknown): string | undefined =>
    axios.isAxiosError(e) ? (e.response?.data as { error?: string } | undefined)?.error : undefined;
