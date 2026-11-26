import { useEffect } from 'react';

export interface LocationOption {
    _id: string;
    name: string;
    category: string;
    division?: 'DIVISI 1' | 'DIVISI 2' | 'DIVISI 3' | null;
    cameras?: (string | { _id?: string })[];
}

export function useEscapeClose(onClose: () => void) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
}

/** Parse satu baris CSV dengan dukungan tanda kutip ganda (RFC 4180). */
export function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') { cur += '"'; i++; }
                else inQuotes = false;
            } else {
                cur += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            out.push(cur.trim());
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur.trim());
    return out;
}
