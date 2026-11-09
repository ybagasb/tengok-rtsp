"use client";
/**
 * QhsseGlance — grid kartu QHSSE (dengan grafik mini) untuk panel Ringkasan di
 * halaman detail proyek. Grid 5 kolom: baris Quality & Safety berisi 5 kartu; baris
 * Health, Environment & Security berisi 4 kartu dengan 5R dilebarkan (jumlah + durasi).
 */
import QhsseCard from '@/components/project/QhsseCard';
import { QHSSE_DIM_BY_ID, type QhsseData, type QhsseDimId } from '@/lib/qhsse';

const WIDE: Partial<Record<QhsseDimId, string>> = { r5: 'col-span-2' };

export default function QhsseGlance({ data, ids, onOpen, className = '' }: {
    data?: QhsseData; ids: QhsseDimId[]; onOpen?: (id: QhsseDimId) => void; className?: string;
}) {
    return (
        <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 ${className}`}>
            {ids.map(id => (
                <QhsseCard
                    key={id}
                    dim={QHSSE_DIM_BY_ID[id]}
                    data={data}
                    compact
                    onClick={onOpen ? () => onOpen(id) : undefined}
                    className={`lg:min-h-0 ${WIDE[id] ?? ''}`}
                />
            ))}
        </div>
    );
}
