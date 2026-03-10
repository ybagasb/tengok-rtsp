"use client";

import { useState } from 'react';
import useSWR, { mutate } from 'swr';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import axios from 'axios';
import { Trash2, Plus, Monitor, MapPin, User, Phone, Loader2, ArrowLeft, Pencil, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { ICameraData } from '@/models/Camera';

const schema = z.object({
    name: z.string().min(1, "Name is required"),
    streamUrl: z.string().min(1, "Stream URL is required").url("Must be a valid URL"),
});

type FormData = z.infer<typeof schema>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// ── Reusable field component ──────────────────────────────────────────────────
function Field({ label, icon, error, children }: {
    label: string; icon?: React.ReactNode; error?: string; children: React.ReactNode;
}) {
    return (
        <div>
            <label className="text-xs font-semibold text-slate-400 uppercase ml-1">{label}</label>
            <div className="relative mt-1">
                {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>}
                {children}
            </div>
            {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
    );
}

const inputCls = (hasIcon = false) =>
    `w-full bg-black/40 border border-white/10 rounded-lg ${hasIcon ? 'py-3 pl-10 pr-3' : 'p-3'} text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all`;

// ── Edit Modal ────────────────────────────────────────────────────────────────
function EditModal({
    camera,
    onClose,
}: {
    camera: ICameraData;
    onClose: () => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: camera.name,
            streamUrl: camera.streamUrl,
        },
    });

    const onSubmit = async (data: FormData) => {
        setIsSaving(true);
        try {
            await axios.put(`/api/cameras/${camera._id}`, data);
            toast.success('Camera updated successfully');
            mutate('/api/cameras');
            onClose();
        } catch {
            toast.error('Failed to update camera');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-white/10">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Pencil className="w-4 h-4 text-blue-400" />
                        Edit Camera
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
                    <Field label="Camera Name" error={errors.name?.message}>
                        <input {...register('name')} className={inputCls()} placeholder="e.g. Lobby Entrance" />
                    </Field>

                    <Field label="Stream URL (HLS)" error={errors.streamUrl?.message}>
                        <input {...register('streamUrl')} className={inputCls()} placeholder="http://..." />
                    </Field>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:border-white/20 transition-all text-sm font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                        >
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save Changes</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main Admin Page ───────────────────────────────────────────────────────────
export default function AdminPage() {
    const { data, isLoading } = useSWR('/api/cameras', fetcher);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [editingCamera, setEditingCamera] = useState<ICameraData | null>(null);

    const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema)
    });

    const onSubmit = async (data: FormData) => {
        setIsSubmitting(true);
        try {
            await axios.post('/api/cameras', data);
            toast.success('Camera added successfully');
            reset();
            mutate('/api/cameras');
        } catch {
            toast.error('Failed to add camera');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this camera?')) return;
        try {
            await axios.delete(`/api/cameras/${id}`);
            toast.success('Camera deleted');
            mutate('/api/cameras');
        } catch {
            toast.error('Failed to delete camera');
        }
    };

    const cameras: ICameraData[] = data?.data || [];

    return (
        <div className="min-h-screen bg-slate-950 text-white p-6 md:p-12">
            {/* Edit Modal */}
            {editingCamera && (
                <EditModal camera={editingCamera} onClose={() => setEditingCamera(null)} />
            )}

            <div className="max-w-6xl mx-auto">
                <header className="flex items-center justify-between mb-10">
                    <div className="flex items-center gap-4">
                        <Link href="/categories" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors">
                            <ArrowLeft className="w-5 h-5 text-slate-400" />
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">Camera Management</h1>
                            <div className="flex items-center gap-3 mt-1">
                                <p className="text-slate-400 text-sm">Add, edit, and configure CCTV streams</p>
                                <span className="text-slate-600 font-bold">•</span>
                                <Link href="/admin/locations" className="text-yellow-400 hover:text-yellow-300 text-sm font-medium transition-colors">
                                    Kelola Lokasi Peta &rarr;
                                </Link>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Add Camera Form */}
                    <div className="lg:col-span-1">
                        <div className="bg-slate-900/50 border border-white/5 p-6 rounded-2xl sticky top-6">
                            <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                <Plus className="w-5 h-5 text-blue-400" />
                                Add New Camera
                            </h2>

                            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                                <Field label="Camera Name" error={errors.name?.message}>
                                    <input {...register('name')} className={inputCls()} placeholder="e.g. Lobby Entrance" />
                                </Field>
                                <Field label="Stream URL (HLS)" error={errors.streamUrl?.message}>
                                    <input {...register('streamUrl')} className={inputCls()} placeholder="http://..." />
                                </Field>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3 rounded-xl transition-all shadow-[0_4px_14px_0_rgba(37,99,235,0.39)] hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Device'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Camera List */}
                    <div className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-semibold flex items-center gap-2 ml-1">
                            <Monitor className="w-5 h-5 text-blue-400" />
                            Active Cameras ({cameras.length})
                        </h2>

                        {isLoading ? (
                            <div className="text-center py-12 text-slate-500 animate-pulse">Loading cameras...</div>
                        ) : cameras.length === 0 ? (
                            <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/50">
                                No cameras added yet.
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {cameras.map((cam) => (
                                    <div key={cam._id as string} className="bg-slate-900/50 border border-white/5 p-4 rounded-xl flex items-center justify-between hover:border-white/10 transition-all group">
                                        <div className="flex items-center gap-4 min-w-0">
                                            <div className="w-16 h-10 flex-shrink-0 bg-black rounded-lg border border-white/5 flex items-center justify-center text-slate-600 text-[10px]">
                                                CCTV
                                            </div>
                                            <div className="min-w-0">
                                                <h3 className="font-semibold text-white truncate">{cam.name}</h3>
                                                <p className="text-slate-600 text-[11px] mt-1 truncate max-w-xs">{cam.streamUrl}</p>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                                            <button
                                                onClick={() => setEditingCamera(cam)}
                                                className="p-2 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                title="Edit Camera"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cam._id as string)}
                                                className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                                title="Delete Camera"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
