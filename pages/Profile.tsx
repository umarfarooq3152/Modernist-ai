
import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { OrderRecord, Review } from '../types';
import { 
  User, 
  Package, 
  MessageSquare, 
  Settings, 
  ChevronRight, 
  Calendar, 
  MapPin, 
  LogOut, 
  Shield, 
  ArrowLeft,
  Camera,
  Star,
  ExternalLink,
  Edit2,
  Check,
  X,
  Save
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Profile: React.FC = () => {
  const { user, profile, logout, uploadAvatar, loading: authLoading, updateProfile } = useAuth();
  const { fetchUserOrders, fetchUserReviews, addToast } = useStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'acquisitions' | 'testimonials'>('overview');
  
  // Edit State
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editedAddress, setEditedAddress] = useState('');
  const [editedCity, setEditedCity] = useState('');
  const [editedPostal, setEditedPostal] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/');
      return;
    }

    const loadUserData = async () => {
      if (user) {
        setLoading(true);
        const [userOrders, userReviews] = await Promise.all([
          fetchUserOrders(user.id),
          fetchUserReviews(user.id)
        ]);
        setOrders(userOrders);
        setReviews(userReviews);
        setLoading(false);
      }
    };

    loadUserData();
  }, [user, authLoading, navigate, fetchUserOrders, fetchUserReviews]);

  useEffect(() => {
    if (profile) {
      setEditedAddress(profile.saved_address || '');
      setEditedCity(profile.saved_city || '');
      setEditedPostal(profile.saved_postal || '');
    }
  }, [profile]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        await uploadAvatar(file);
        addToast('Archival portrait synchronized.', 'success');
      } catch (err) {
        console.error(err);
        addToast('Portrait synchronization failed.', 'error');
      } finally {
        setIsUploading(false);
      }
    }
  };

  const handleSaveAddress = async () => {
    try {
      await updateProfile({
        saved_address: editedAddress,
        saved_city: editedCity,
        saved_postal: editedPostal
      });
      setIsEditingAddress(false);
      addToast('Archival destination documented.', 'success');
    } catch (err) {
      console.error(err);
      addToast('Destination synchronization failed.', 'error');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 page-reveal">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] font-black text-gray-400 animate-pulse">Syncing Patron Profile...</p>
      </div>
    );
  }

  if (!user) return null;

  const displayName = user.user_metadata?.full_name || user.user_metadata?.display_name || 'Archival Patron';
  const joinDate = new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 md:py-24 page-reveal">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/*" 
        className="hidden" 
      />
      
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 mb-20 border-b border-black pb-12">
        <div className="flex flex-col md:flex-row gap-10 items-start md:items-end">
          <div 
            onClick={handleAvatarClick}
            className="w-32 h-32 md:w-48 md:h-48 bg-gray-50 border border-black flex items-center justify-center overflow-hidden shrink-0 group relative cursor-pointer"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className={`w-full h-full object-cover transition-all group-hover:scale-110 ${isUploading ? 'blur-sm grayscale' : 'grayscale group-hover:grayscale-0'}`} />
            ) : (
              <User size={64} strokeWidth={0.5} className="text-gray-300" />
            )}
            
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white">
              <Camera size={24} className="mb-2" />
              <span className="text-[8px] uppercase tracking-widest font-black">Sync Portrait</span>
            </div>
            
            {isUploading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-white border-t-transparent animate-spin rounded-full" />
              </div>
            )}
            
            <div className="absolute bottom-2 right-2 bg-black text-white p-1 text-[8px] uppercase tracking-widest font-black">
              Verified
            </div>
          </div>
          <div className="space-y-4">
            <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Archival Member since {joinDate}</span>
            <h1 className="font-serif-elegant text-5xl md:text-8xl font-bold uppercase tracking-tighter leading-[0.9]">{displayName}</h1>
            <div className="flex flex-wrap gap-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-500 italic">
              <span className="flex items-center gap-2"><MapPin size={12} /> {profile?.saved_city || 'Global Nomad'}</span>
              <span className="flex items-center gap-2"><Shield size={12} /> Elite Patron</span>
              <span className="text-black not-italic underline underline-offset-4">{user.email}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => logout()}
            className="flex items-center gap-3 border border-black/10 px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all active:scale-95"
          >
            <LogOut size={14} />
            <span>Terminate Session</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-black/5 mb-16 overflow-x-auto no-scrollbar">
        {[
          { id: 'overview', label: 'Overview', icon: User },
          { id: 'acquisitions', label: 'Acquisitions', icon: Package },
          { id: 'testimonials', label: 'Testimonials', icon: MessageSquare }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-4 px-10 py-6 text-[10px] uppercase tracking-[0.4em] font-black transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'}`}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 animate-in fade-in duration-700">
            <div className="md:col-span-2 space-y-16">
              <div className="space-y-8">
                <h3 className="text-xs uppercase tracking-[0.4em] font-black border-l-2 border-black pl-6">Profile Narrative</h3>
                <p className="font-clerk italic text-2xl leading-relaxed text-gray-700 max-w-2xl">
                  "As an elite patron of the MODERNIST archive, your taste in minimalist silhouettes and documented artisan pieces defines your digital landscape."
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
                <div className="bg-gray-50/50 p-10 border border-black/5 space-y-4 relative group">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 font-black">Archived Destination</p>
                    {!isEditingAddress ? (
                      <button 
                        onClick={() => setIsEditingAddress(true)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-2 hover:bg-black hover:text-white"
                      >
                        <Edit2 size={12} />
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={handleSaveAddress} className="text-green-600 hover:scale-110 transition-transform"><Save size={14} /></button>
                        <button onClick={() => setIsEditingAddress(false)} className="text-red-600 hover:scale-110 transition-transform"><X size={14} /></button>
                      </div>
                    )}
                  </div>

                  {isEditingAddress ? (
                    <div className="space-y-4 animate-in fade-in duration-300">
                      <input 
                        type="text" 
                        value={editedAddress} 
                        onChange={e => setEditedAddress(e.target.value)}
                        placeholder="ADDRESS"
                        className="w-full bg-transparent border-b border-black text-xs uppercase tracking-widest outline-none py-1"
                      />
                      <div className="flex gap-4">
                        <input 
                          type="text" 
                          value={editedCity} 
                          onChange={e => setEditedCity(e.target.value)}
                          placeholder="CITY"
                          className="w-1/2 bg-transparent border-b border-black text-xs uppercase tracking-widest outline-none py-1"
                        />
                        <input 
                          type="text" 
                          value={editedPostal} 
                          onChange={e => setEditedPostal(e.target.value)}
                          placeholder="POSTAL"
                          className="w-1/2 bg-transparent border-b border-black text-xs uppercase tracking-widest outline-none py-1"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {profile?.saved_address ? (
                        <div className="space-y-2">
                          <p className="text-xl font-serif-elegant font-bold uppercase tracking-tight">{profile.saved_address}</p>
                          <p className="text-[9px] uppercase tracking-widest text-gray-500">{profile.saved_city}, {profile.saved_postal}</p>
                        </div>
                      ) : (
                        <p className="text-xl font-serif-elegant font-bold uppercase tracking-tight text-gray-300 italic">Uncharted</p>
                      )}
                      <p className="text-[9px] uppercase tracking-widest text-gray-500 leading-relaxed pt-4">Your preferred silhouette destination for streamlined acquisition.</p>
                    </>
                  )}
                </div>
                <div className="bg-gray-50/50 p-10 border border-black/5 space-y-4">
                  <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 font-black">Bag Synergy</p>
                  <p className="text-3xl font-serif-elegant font-bold uppercase tracking-tight">{orders.length} documented</p>
                  <p className="text-[9px] uppercase tracking-widest text-gray-500 leading-relaxed">You have archived {orders.reduce((sum, o) => sum + o.items.length, 0)} unique pieces since join date.</p>
                </div>
              </div>
            </div>
            
            <div className="space-y-12">
               <div className="bg-black text-white p-10 space-y-8">
                  <h4 className="text-[10px] uppercase tracking-[0.4em] font-black">Security Protocol</h4>
                  <div className="space-y-6">
                    <button className="w-full flex items-center justify-between group">
                      <span className="text-[9px] uppercase tracking-widest">Rotate Credentials</span>
                      <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button className="w-full flex items-center justify-between group">
                      <span className="text-[9px] uppercase tracking-widest">Multi-Factor Actuation</span>
                      <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                    <button className="w-full flex items-center justify-between group">
                      <span className="text-[9px] uppercase tracking-widest">Archival Export</span>
                      <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </button>
                  </div>
               </div>
               
               <div className="p-10 border border-black/5 bg-gray-50/20 space-y-6">
                  <h4 className="text-[10px] uppercase tracking-[0.4em] font-black text-gray-400">Patron Preferences</h4>
                  <div className="flex flex-wrap gap-3">
                    {['Minimalist', 'Brutalist', 'Architectural', 'Eco-Archive'].map(pref => (
                      <span key={pref} className="px-4 py-2 bg-white border border-black/10 text-[8px] uppercase tracking-widest font-black">{pref}</span>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'acquisitions' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {orders.length === 0 ? (
              <div className="py-32 text-center flex flex-col items-center">
                <Package size={48} strokeWidth={0.5} className="text-gray-200 mb-8" />
                <p className="text-xs uppercase tracking-[0.5em] text-gray-300 font-black italic">Zero documented acquisitions archived.</p>
                <Link to="/" className="mt-10 border border-black px-12 py-5 text-[10px] font-black uppercase tracking-[0.3em] hover:bg-black hover:text-white transition-all">Document First Piece</Link>
              </div>
            ) : (
              <div className="space-y-20">
                {orders.map((order) => (
                  <div key={order.id} className="group">
                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 border-b border-black/5 pb-10 mb-10">
                      <div className="space-y-4">
                        <div className="flex items-center gap-6">
                           <span className="text-xs font-black uppercase tracking-widest">{order.id}</span>
                           <span className={`text-[8px] uppercase tracking-widest font-black px-3 py-1 bg-black text-white italic`}>{order.status}</span>
                        </div>
                        <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                           <span className="flex items-center gap-2"><Calendar size={12} /> {new Date(order.created_at).toLocaleDateString()}</span>
                           <span>{order.items.length} Archival Items</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-black mb-1">Acquisition Valuation</p>
                        <p className="text-3xl font-serif-elegant font-bold">${order.total_amount.toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="bg-gray-50/30 border border-black/5 p-6 flex items-center gap-6 group/item hover:border-black transition-colors">
                          <div className="w-20 h-24 bg-gray-100 shrink-0 overflow-hidden">
                            <img src={item.image_url} alt="" className="w-full h-full object-cover grayscale transition-all group-hover/item:grayscale-0" />
                          </div>
                          <div className="flex-1 space-y-2">
                             <h5 className="text-[10px] font-black uppercase tracking-widest truncate">{item.name}</h5>
                             <p className="text-[9px] uppercase tracking-widest text-gray-400">Qty: {item.quantity}</p>
                             <p className="text-xs font-bold">${item.price.toLocaleString()}</p>
                          </div>
                          <Link to={`/product/${item.id}`} className="p-2 opacity-0 group-hover/item:opacity-100 transition-opacity">
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'testimonials' && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
             {reviews.length === 0 ? (
               <div className="py-32 text-center flex flex-col items-center">
                 <MessageSquare size={48} strokeWidth={0.5} className="text-gray-200 mb-8" />
                 <p className="text-xs uppercase tracking-[0.5em] text-gray-300 font-black italic">No testimonials synchronized from your identity.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                 {reviews.map((review) => (
                   <div key={review.id} className="bg-white border border-black p-10 space-y-8 group hover:shadow-2xl transition-all">
                     <div className="flex justify-between items-start">
                        <div className="space-y-4">
                           <div className="flex gap-1">
                             {[...Array(5)].map((_, i) => (
                               <Star key={i} size={10} fill={i < review.rating ? "black" : "none"} className={i < review.rating ? "text-black" : "text-gray-200"} />
                             ))}
                           </div>
                           <p className="text-[8px] uppercase tracking-[0.4em] text-gray-400 font-black italic">{new Date(review.date).toLocaleDateString()}</p>
                        </div>
                        <div className="w-12 h-16 bg-gray-100 overflow-hidden border border-black/5 grayscale group-hover:grayscale-0 transition-all">
                           <img src={review.product?.image_url} alt="" className="w-full h-full object-cover" />
                        </div>
                     </div>
                     <div className="space-y-6">
                        <h4 className="text-[10px] uppercase tracking-[0.4em] font-black group-hover:underline underline-offset-8 decoration-1">{review.product?.name}</h4>
                        <p className="font-clerk italic text-xl leading-relaxed">"{review.text}"</p>
                     </div>
                     <Link 
                       to={`/product/${review.product_id}`}
                       className="flex items-center gap-4 text-[9px] uppercase tracking-[0.4em] font-black pt-6 border-t border-black/5 opacity-40 hover:opacity-100 transition-opacity"
                     >
                       <ArrowLeft size={12} className="rotate-180" />
                       View Original Silhouette
                     </Link>
                   </div>
                 ))}
               </div>
             )}
          </div>
        )}
      </div>

      <div className="mt-40 pt-16 border-t border-black/5 flex flex-col md:flex-row justify-between items-center gap-10">
        <p className="text-[9px] uppercase tracking-[0.5em] text-gray-400 font-black">Archive Identity verified by MODERNIST secure liaison.</p>
        <div className="flex gap-10 text-[9px] uppercase tracking-[0.4em] font-black">
          <Link to="/" className="hover:opacity-50 transition-opacity">Privacy Protocol</Link>
          <Link to="/" className="hover:opacity-50 transition-opacity">Archival Terms</Link>
        </div>
      </div>
    </div>
  );
};

export default Profile;
