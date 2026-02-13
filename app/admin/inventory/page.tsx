
'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { RefreshCw, Plus, Edit, Search } from 'lucide-react';
import { fetchERPProducts, syncFromN8N } from '../../../lib/actions/sync';

export default function InventoryAdmin() {
  const [searchQuery, setSearchQuery] = useState('');

  // Use the Server Action for fetching data
  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ['erp-products'],
    queryFn: async () => await fetchERPProducts()
  });

  // Use the Server Action for syncing
  const syncMutation = useMutation({
    mutationFn: async () => {
      const result = await syncFromN8N();
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      refetch();
    }
  });

  return (
    <div className="space-y-12">
      <div className="flex justify-between items-end border-b border-black pb-8">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-400 mb-2">Inventory Logic</p>
          <h1 className="text-5xl font-serif-elegant font-bold uppercase tracking-tighter">Archival Sync</h1>
        </div>
        <button 
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="bg-black text-white px-8 py-4 text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-all flex items-center gap-3 disabled:opacity-50"
        >
          {syncMutation.isPending ? <RefreshCw className="animate-spin" size={14} /> : <RefreshCw size={14} />}
          <span>{syncMutation.isPending ? 'Syncing...' : 'Sync with ERP'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-8 overflow-x-auto">
          {isLoading ? (
             <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-black border-t-transparent animate-spin rounded-full"></div></div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/10">
                  <th className="py-4 text-[10px] uppercase font-black text-gray-400">ID</th>
                  <th className="py-4 text-[10px] uppercase font-black text-gray-400">Identity</th>
                  <th className="py-4 text-[10px] uppercase font-black text-gray-400">Public</th>
                  <th className="py-4 text-[10px] uppercase font-black text-gray-400">Floor</th>
                  <th className="py-4 text-[10px] uppercase font-black text-gray-400">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {products?.map((p: any) => (
                  <tr key={p.id} className="group hover:bg-black/5 transition-colors">
                    <td className="py-6 text-[10px] font-mono text-gray-500">{String(p.id).slice(0, 8)}...</td>
                    <td className="py-6">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-12 bg-gray-100 grayscale group-hover:grayscale-0 transition-all border border-black/5">
                          {p.image_url && <img src={p.image_url} className="w-full h-full object-cover" alt="" />}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-widest">{p.name}</span>
                      </div>
                    </td>
                    <td className="py-6 text-xs font-black">${p.price}</td>
                    <td className="py-6 text-xs font-black text-gray-400">${p.bottom_price}</td>
                    <td className="py-6">
                      <button className="p-2 hover:bg-black hover:text-white transition-all"><Edit size={14} /></button>
                    </td>
                  </tr>
                ))}
                {(!products || products.length === 0) && (
                   <tr><td colSpan={5} className="py-8 text-center text-[10px] uppercase tracking-widest text-gray-400 font-bold">No active inventory in ERP</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="glass p-8 border border-black/5">
            <h3 className="text-xs font-black uppercase tracking-widest mb-6">Vector Sandbox</h3>
            <div className="space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Query semantic similarity..."
                  className="w-full bg-transparent border-b border-black py-3 text-xs uppercase tracking-widest outline-none"
                />
                <Search className="absolute right-0 top-3 text-gray-400" size={14} />
              </div>
              <button className="w-full bg-black text-white py-4 text-[9px] font-black uppercase tracking-widest hover:bg-gray-800 transition-colors">Run Inference</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
