import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { migrateHeimtextilToShowroom, getHeimtextilCount, getShowroomProductsCount } from '../lib/firebase';

export function AdminMigrate() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [counts, setCounts] = useState<{ heimtextil: number; showroom: number } | null>(null);
  const [result, setResult] = useState<{ migrated: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCounts = async () => {
    setLoading(true);
    try {
      const [heimtextil, showroom] = await Promise.all([
        getHeimtextilCount(),
        getShowroomProductsCount(),
      ]);
      setCounts({ heimtextil, showroom });
    } catch (err) {
      setError(`Failed to fetch counts: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const runMigration = async () => {
    if (!confirm('Are you sure you want to migrate Heimtextil products to Showroom? This will add "Heimtextil 2026" tags to all migrated products.')) {
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const migrationResult = await migrateHeimtextilToShowroom();
      setResult(migrationResult);
      // Refresh counts after migration
      await fetchCounts();
    } catch (err) {
      setError(`Migration failed: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/')}
              className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin: Data Migration</h1>
              <p className="text-sm text-gray-500">Merge Heimtextil products into Showroom</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Step 1: Check counts */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Step 1: Check Collection Counts
          </h2>

          {counts ? (
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-blue-600">{counts.heimtextil}</p>
                <p className="text-sm text-blue-700">heimtextil_products</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-600">{counts.showroom}</p>
                <p className="text-sm text-green-700">showroom_products</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 mb-4">Click the button to check current counts</p>
          )}

          <button
            onClick={fetchCounts}
            disabled={loading}
            className="w-full py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Checking...' : 'Check Counts'}
          </button>
        </section>

        {/* Step 2: Run migration */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Step 2: Run Migration
          </h2>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800">
              <strong>What this does:</strong>
            </p>
            <ul className="text-sm text-amber-700 mt-2 space-y-1 list-disc list-inside">
              <li>Copies all docs from <code>heimtextil_products</code> to <code>showroom_products</code></li>
              <li>Adds <code>source: "Heimtextil 2026"</code> tag to each product</li>
              <li>Skips products that already exist in showroom_products</li>
              <li>Does NOT delete the original heimtextil_products</li>
            </ul>
          </div>

          <button
            onClick={runMigration}
            disabled={loading || !counts}
            className="w-full py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {loading ? 'Migrating...' : 'Run Migration'}
          </button>
        </section>

        {/* Result */}
        {result && (
          <section className="bg-green-50 border border-green-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-green-800 mb-4 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Migration Complete!
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{result.migrated}</p>
                <p className="text-sm text-green-700">Migrated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-amber-600">{result.skipped}</p>
                <p className="text-sm text-amber-700">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600">{result.errors.length}</p>
                <p className="text-sm text-red-700">Errors</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4 p-3 bg-red-50 rounded-lg">
                <p className="text-sm font-medium text-red-800">Errors:</p>
                <ul className="text-xs text-red-700 mt-1 space-y-1">
                  {result.errors.slice(0, 5).map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Error */}
        {error && (
          <section className="bg-red-50 border border-red-200 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-red-800 mb-2 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Error
            </h2>
            <p className="text-sm text-red-700">{error}</p>
          </section>
        )}
      </main>
    </div>
  );
}
