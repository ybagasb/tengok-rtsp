"use client";

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertTriangle, X, Search } from 'lucide-react';

// ── Page Header ──────────────────────────────────────────────────────────────
export function PageHeader({
    icon: Icon,
    title,
    subtitle,
    actions,
}: {
    icon: React.ElementType;
    title: string;
    subtitle: string;
    actions?: React.ReactNode;
}) {
    return (
        <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 pb-6 border-b border-black/5 dark:border-white/5"
        >
            <div>
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight uppercase flex items-center gap-4 text-slate-900 dark:text-white">
                    <div className="p-3 bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl shadow-[0_8px_30px_rgba(234,179,8,0.25)] relative overflow-hidden group">
                        <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Icon className="w-7 h-7 sm:w-8 sm:h-8 text-slate-950 relative z-10" />
                    </div>
                    {title}
                </h1>
                <p className="text-slate-500 text-sm mt-3 font-medium tracking-wide">
                    {subtitle}
                </p>
            </div>
            {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
        </motion.header>
    );
}

// ── Section Header (for form groups) ─────────────────────────────────────────
export function SectionHeader({
    icon: Icon,
    title,
}: {
    icon: React.ElementType;
    title: string;
}) {
    return (
        <div className="flex items-center gap-2.5 mb-5 border-b border-black/5 dark:border-white/5 pb-3">
            <div className="p-1.5 rounded-lg bg-yellow-500/10">
                <Icon className="w-4 h-4 text-yellow-500" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
        </div>
    );
}

// ── Form Field ───────────────────────────────────────────────────────────────
export function FormField({
    label,
    icon,
    error,
    required,
    children,
}: {
    label: string;
    icon?: React.ReactNode;
    error?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider ml-1 block">
                {label}{required && ' *'}
            </label>
            <div className="relative">
                {icon && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
                {children}
            </div>
            {error && <p className="text-red-400 text-[11px] font-medium mt-1.5 ml-1">{error}</p>}
        </div>
    );
}

// ── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({
    icon: Icon,
    title,
    subtitle,
}: {
    icon: React.ElementType;
    title: string;
    subtitle?: string;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-24 text-slate-600 border-2 border-dashed border-black/10 dark:border-white/10 rounded-[2rem] bg-black/[0.02] dark:bg-slate-900/20"
        >
            <Icon className="w-20 h-20 mb-4 opacity-10" />
            <p className="font-bold text-lg uppercase tracking-wider opacity-30">{title}</p>
            {subtitle && <p className="text-sm mt-2 opacity-40 font-medium">{subtitle}</p>}
        </motion.div>
    );
}

// ── Loading Spinner ──────────────────────────────────────────────────────────
export function LoadingState({ message = "Sinkronisasi Data..." }: { message?: string }) {
    return (
        <div className="text-center py-20 text-slate-500 flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-yellow-500" />
            <p className="uppercase tracking-wider font-bold text-sm">{message}</p>
        </div>
    );
}

// ── Full-Page Loading ────────────────────────────────────────────────────────
export function FullPageLoading() {
    return (
        <div className="flex justify-center items-center h-screen bg-slate-100 dark:bg-slate-950">
            <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
        </div>
    );
}

// ── Search Bar ───────────────────────────────────────────────────────────────
export function SearchBar({
    value,
    onChange,
    placeholder = "Cari...",
}: {
    value: string;
    onChange: (val: string) => void;
    placeholder?: string;
}) {
    return (
        <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-black/[0.04] dark:bg-black/40 border border-black/10 dark:border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-900 dark:text-white focus:border-yellow-500/40 focus:ring-1 focus:ring-yellow-500/40 outline-none transition-all placeholder:text-slate-600"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                >
                    <X className="w-3.5 h-3.5 text-slate-500" />
                </button>
            )}
        </div>
    );
}

// ── Confirm Modal (replaces window.confirm) ──────────────────────────────────
export function ConfirmModal({
    open,
    onConfirm,
    onCancel,
    title = "Konfirmasi",
    message,
    confirmLabel = "Hapus",
    cancelLabel = "Batal",
    variant = "danger",
    isLoading = false,
}: {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    title?: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: "danger" | "warning";
    isLoading?: boolean;
}) {
    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center p-6"
                >
                    <div
                        className="absolute inset-0 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl"
                        onClick={onCancel}
                    />
                    <motion.div
                        initial={{ scale: 0.92, opacity: 0, y: 16 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.92, opacity: 0, y: 16 }}
                        transition={{ type: "spring", stiffness: 400, damping: 28 }}
                        className="relative w-full max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl border border-black/10 dark:border-white/10 rounded-3xl p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.7)]"
                    >
                        <div className="flex flex-col items-center text-center">
                            <div className={`p-5 rounded-3xl mb-6 ${variant === 'danger' ? 'bg-red-500/10' : 'bg-yellow-500/10'}`}>
                                <AlertTriangle className={`w-8 h-8 ${variant === 'danger' ? 'text-red-500' : 'text-yellow-500'}`} />
                            </div>

                            <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-2">{title}</h2>
                            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed mb-8">{message}</p>

                            <div className="flex gap-3 w-full">
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    type="button"
                                    onClick={onCancel}
                                    disabled={isLoading}
                                    className="flex-1 py-3.5 rounded-xl border border-black/10 dark:border-white/10 text-slate-500 dark:text-slate-400 font-bold hover:text-slate-900 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all text-sm uppercase tracking-wider"
                                >
                                    {cancelLabel}
                                </motion.button>
                                <motion.button
                                    whileTap={{ scale: 0.97 }}
                                    type="button"
                                    onClick={onConfirm}
                                    disabled={isLoading}
                                    className={`flex-1 py-3.5 rounded-xl font-bold transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${
                                        variant === 'danger'
                                            ? 'bg-red-500 hover:bg-red-600 text-slate-900 dark:text-white shadow-[0_4px_20px_rgba(239,68,68,0.3)]'
                                            : 'bg-yellow-500 hover:bg-yellow-600 text-slate-950 shadow-[0_4px_20px_rgba(234,179,8,0.3)]'
                                    } disabled:opacity-50`}
                                >
                                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmLabel}
                                </motion.button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

// ── Badge / Count indicator ──────────────────────────────────────────────────
export function CountBadge({ count }: { count: number }) {
    return (
        <span className="text-slate-900 bg-yellow-500 text-sm font-bold px-2.5 py-0.5 rounded-full shadow-[0_0_10px_rgba(234,179,8,0.3)]">
            {count}
        </span>
    );
}

// ── Custom hook: useConfirm ──────────────────────────────────────────────────
export function useConfirm() {
    const [state, setState] = useState<{
        open: boolean;
        message: string;
        title?: string;
        variant?: "danger" | "warning";
        resolve?: (val: boolean) => void;
    }>({ open: false, message: '' });

    const confirm = useCallback((message: string, options?: { title?: string; variant?: "danger" | "warning" }) => {
        return new Promise<boolean>((resolve) => {
            setState({
                open: true,
                message,
                title: options?.title,
                variant: options?.variant || 'danger',
                resolve,
            });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        state.resolve?.(true);
        setState(s => ({ ...s, open: false }));
    }, [state]);

    const handleCancel = useCallback(() => {
        state.resolve?.(false);
        setState(s => ({ ...s, open: false }));
    }, [state]);

    const ConfirmDialog = (
        <ConfirmModal
            open={state.open}
            onConfirm={handleConfirm}
            onCancel={handleCancel}
            title={state.title}
            message={state.message}
            variant={state.variant}
        />
    );

    return { confirm, ConfirmDialog };
}
