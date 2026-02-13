
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ClerkLog } from '../../types';
import { Activity, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';

const HaggleTracker = () => {
  const [logs, setLogs] = useState<ClerkLog[]>([]);

  useEffect(() => {
    // Initial fetch
    const fetchLogs = async () => {
      const { data } = await supabase
        .from('clerk_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setLogs(data);
    };
    fetchLogs();

    // Subscribe to real-time inserts
    const channel = supabase
      .channel('clerk-realtime')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'clerk_logs' }, 
        (payload) => {
          setLogs(prev => [payload.new as ClerkLog, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-black pb-4">
        <h2 className="text-xl font-serif-elegant font-bold uppercase tracking-tight">Real-time Negotiations</h2>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase text-green-500">
          <Activity size={12} className="animate-pulse" />
          <span>Stream Active</span>
        </div>
      </div>
      
      <div className="grid gap-4">
        {logs.map((log) => (
          <div key={log.id} className="glass p-5 border border-black/5 flex flex-col md:flex-row gap-6 animate-in slide-in-from-right duration-500">
            <div className="shrink-0 flex items-center justify-center w-12 h-12 bg-black text-white text-xs font-bold rounded-none">
              {log.clerk_sentiment[0].toUpperCase()}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase tracking-widest">{log.user_email || 'Anonymous'}</span>
                <span className="text-[10px] text-gray-400">{new Date(log.created_at).toLocaleTimeString()}</span>
              </div>
              <p className="text-sm font-clerk italic line-clamp-1">"{log.user_message}"</p>
              <div className="flex gap-4 pt-2">
                <div className="flex items-center gap-1 text-[9px] font-bold uppercase">
                  {log.negotiation_successful ? <TrendingUp size={10} className="text-green-500" /> : <TrendingDown size={10} className="text-red-500" />}
                  {log.negotiation_successful ? `Accepted (-${log.discount_offered}%)` : 'Refused'}
                </div>
                <div className="text-[9px] font-bold uppercase text-gray-400">Mood: {log.clerk_sentiment}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HaggleTracker;
