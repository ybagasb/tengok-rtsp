import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ division: string }>;
  searchParams: Promise<{ category?: string }>;
}

/**
 * Rute legacy /categories/[division]
 * Menjalankan server-side redirect agar bookmark atau link lama tetap hidup:
 * - Bila ada ?category=X -> /map?division=<division>&category=X
 * - Bila tanpa category -> /categories?div=<division>
 */
export default async function DivisionRedirectPage({
  params,
  searchParams,
}: PageProps) {
  const { division } = await params;
  const { category } = await searchParams;

  const decodedDivision = decodeURIComponent(division);

  if (category) {
    redirect(
      `/map?division=${encodeURIComponent(decodedDivision)}&category=${encodeURIComponent(
        category
      )}`
    );
  }

  redirect(`/categories?div=${encodeURIComponent(decodedDivision)}`);
}
