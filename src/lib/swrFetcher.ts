// Fetcher SWR bersama yang melempar error pada respons non-2xx, sehingga HTTP
// 500/4xx tidak diperlakukan sebagai data valid (menghindari dashboard yang
// diam-diam menampilkan nol). Pakai ini sebagai pengganti
// `fetch(url).then(r => r.json())` yang tidak memeriksa status.
export const swrFetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Permintaan gagal (${res.status} ${res.statusText}): ${url}`);
    }
    return res.json();
};

export default swrFetcher;
