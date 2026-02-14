import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStore } from '../context/StoreContext';
import { OrderRecord, Review } from '../types';
import { 
  User, Package, MessageSquare, ChevronRight, Calendar, MapPin, LogOut, Shield, ArrowLeft, Camera, 
  Star, ExternalLink, Edit2, Check, X, Save, Globe, ArrowRight
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const Profile: React.FC = () => {
  const { user, profile, logout, uploadAvatar, loading: authLoading, updateProfile, changePassword } = useAuth();
  const { fetchUserOrders, fetchUserReviews, addToast } = useStore();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'acquisitions' | 'testimonials'>('overview');
  
  // Expanded Edit State
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', address_line1: '', city: '', postal_code: '', country: ''
  });

  // Password Change State
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Timeout to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('Loading timeout reached. Force stopping...');
        setLoading(false);
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    // Redirect to home if no user and auth is done loading
    if (!authLoading && !user) { 
      console.log('No user, redirecting to home');
      navigate('/'); 
      return; 
    }
    
    let isMounted = true;
    const loadUserData = async () => {
      if (user && isMounted) {
        setLoading(true);
        try {
          const [userOrders, userReviews] = await Promise.all([
            fetchUserOrders(user.id),
            fetchUserReviews(user.id)
          ]);
          if (isMounted) {
            setOrders(userOrders);
            setReviews(userReviews);
          }
        } catch (err) {
          console.error('Failed to load user data:', err);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      }
    };
    
    loadUserData();
    
    return () => {
      isMounted = false;
    };
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setFormData({
        first_name: (profile as any).first_name || '',
        last_name: (profile as any).last_name || '',
        address_line1: (profile as any).address_line1 || profile.saved_address || '',
        city: profile.saved_city || '',
        postal_code: profile.saved_postal || '',
        country: (profile as any).country || 'Denmark'
      });
    }
  }, [profile]);

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        await uploadAvatar(file);
        addToast('Archival portrait synchronized.', 'success');
      } catch (err: any) {
        const errorMsg = err?.message || 'Portrait synchronization failed.';
        console.error('Avatar upload error:', err);
        addToast(errorMsg, 'error');
      } finally { 
        setIsUploading(false); 
        // Reset file input so the same file can be selected again if needed
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleSaveProfile = async () => {
    try {
      await updateProfile({
        ...formData,
        saved_address: formData.address_line1,
        saved_city: formData.city,
        saved_postal: formData.postal_code
      } as any);
      setIsEditingAddress(false);
      addToast('Identity profile synchronized.', 'success');
    } catch (err: any) {
      const errorMsg = err?.message || 'Synchronization failed.';
      console.error('Profile update error:', err);
      addToast(errorMsg, 'error');
    }
  };

  const handleChangePassword = async () => {
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      addToast('New passwords do not match.', 'error');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }

    try {
      // Normal password change - requires current password
      await changePassword(passwordData.currentPassword, passwordData.newPassword);
      setIsChangingPassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      addToast('Credentials rotated successfully.', 'success');
    } catch (err: any) {
      const errorMsg = err?.message || 'Password change failed.';
      console.error('Password change error:', err);
      addToast(errorMsg, 'error');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-8 page-reveal">
        <div className="modern-loader" />
        <p className="text-[10px] uppercase tracking-[0.6em] text-gray-400 animate-pulse">
          Syncing Patron Profile...
        </p>
        {/* Debug info in development */}
        {process.env.NODE_ENV === 'development' && (
          <p className="text-[8px] text-gray-300 mt-4">
            authLoading: {authLoading.toString()} | loading: {loading.toString()}
          </p>
        )}
      </div>
    );
  }
  if (!user) return null;

  const displayName = formData.first_name ? `${formData.first_name} ${formData.last_name}` : (user.user_metadata?.full_name || 'Archival Patron');
  const avatarUrl = profile?.avatar_url || (profile as any)?.picture_url || user.user_metadata?.avatar_url;

  return (
    <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-12 md:py-24 page-reveal">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" 
        className="hidden" 
      />

      {/* Password Change Modal */}
      {isChangingPassword && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-md" 
            onClick={() => {
              setIsChangingPassword(false);
              setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            }} 
          />
          <div className="relative bg-white w-full max-w-md mx-4 border border-black p-10 shadow-2xl animate-in fade-in zoom-in-95 duration-500 max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => {
                setIsChangingPassword(false);
                setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
              }}
              className="absolute top-6 right-6 p-2 hover:bg-black hover:text-white transition-all"
            >
              <X size={20} strokeWidth={1} />
            </button>

            <div className="text-center mb-10">
              <p className="text-[10px] uppercase tracking-[0.4em] text-gray-400 mb-2 font-bold">The Atelier</p>
              <h2 className="font-serif-elegant text-4xl font-bold uppercase tracking-tighter">
                Identity
              </h2>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleChangePassword(); }} className="space-y-5">
              <input
                required
                type="password"
                placeholder="CURRENT PASSWORD"
                value={passwordData.currentPassword}
                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="w-full border-b border-black/10 focus:border-black outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent transition-colors placeholder:text-gray-300"
                autoComplete="current-password"
              />
              <input
                required
                type="password"
                placeholder="NEW PASSWORD"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="w-full border-b border-black/10 focus:border-black outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent transition-colors placeholder:text-gray-300"
                autoComplete="new-password"
              />
              <input
                required
                type="password"
                placeholder="CONFIRM NEW PASSWORD"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="w-full border-b border-black/10 focus:border-black outline-none py-3 text-[10px] uppercase tracking-widest bg-transparent transition-colors placeholder:text-gray-300"
                autoComplete="new-password"
              />

              <button 
                type="submit"
                className="w-full bg-black text-white py-5 text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-white hover:text-black border border-black transition-all flex items-center justify-center space-x-2 mt-8"
              >
                <span>Update</span>
                <ArrowRight size={14} />
              </button>
            </form>

            <div className="flex flex-col space-y-4 pt-6 border-t border-black/5 mt-6">
              <button 
                onClick={() => {
                  setIsChangingPassword(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                }}
                className="text-[9px] uppercase tracking-widest text-gray-400 hover:text-black transition-colors text-center"
              >
                Cancel Operation
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-12 mb-20 border-b border-black pb-12">
        <div className="flex flex-col md:flex-row gap-10 items-start md:items-end">
          <div onClick={handleAvatarClick} className="w-32 h-32 md:w-48 md:h-48 bg-gray-50 border border-black flex items-center justify-center overflow-hidden shrink-0 group relative cursor-pointer">
            {avatarUrl ? <img src={avatarUrl} alt={displayName} className={`w-full h-full object-cover grayscale transition-all group-hover:grayscale-0 ${isUploading && 'blur-sm'}`} /> : <User size={64} strokeWidth={0.5} className="text-gray-300" />}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white"><Camera size={24} className="mb-2" /><span className="text-[8px] uppercase tracking-widest font-black">Sync Portrait</span></div>
            {isUploading && <div className="absolute inset-0 flex items-center justify-center"><div className="w-8 h-8 border-2 border-white border-t-transparent animate-spin rounded-full" /></div>}
          </div>
          <div className="space-y-4">
            <span className="text-[10px] uppercase tracking-[0.5em] text-gray-400 font-black">Verified Member</span>
            <h1 className="font-serif-elegant text-5xl md:text-8xl font-bold uppercase tracking-tighter leading-[0.9]">{displayName}</h1>
            <div className="flex flex-wrap gap-6 text-[10px] uppercase tracking-[0.3em] font-black text-gray-500 italic">
              <span className="flex items-center gap-2 text-black not-italic underline underline-offset-4">{user.email}</span>
            </div>
          </div>
        </div>
        <button onClick={() => logout()} className="border border-black px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black active:scale-95 transition-all flex items-center gap-3"><LogOut size={14} /> Terminate</button>
      </div>

      <div className="flex border-b border-black/5 mb-16 overflow-x-auto no-scrollbar">
        {['overview', 'acquisitions', 'testimonials'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} className={`px-10 py-6 text-[10px] uppercase tracking-[0.4em] font-black transition-all border-b-2 ${activeTab === tab ? 'border-black text-black' : 'border-transparent text-gray-400 hover:text-black'}`}>{tab}</button>
        ))}
      </div>

      <div className="min-h-[400px]">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 animate-in fade-in duration-700">
            <div className="lg:col-span-8 space-y-16">
              <div className="p-10 border border-black/5 bg-gray-50/50 space-y-10 group relative">
                <div className="flex justify-between items-center border-b border-black/5 pb-4">
                   <h3 className="text-[10px] uppercase tracking-[0.4em] font-black">Identity Matrix</h3>
                   {!isEditingAddress ? (
                     <button onClick={() => setIsEditingAddress(true)} className="flex items-center gap-2 text-[9px] uppercase tracking-widest font-black text-gray-400 hover:text-black transition-colors"><Edit2 size={12} /> Edit Profile</button>
                   ) : (
                     <div className="flex gap-4">
                        <button onClick={handleSaveProfile} className="text-green-600 hover:scale-110 transition-transform"><Check size={16} /></button>
                        <button onClick={() => setIsEditingAddress(false)} className="text-red-600 hover:scale-110 transition-transform"><X size={16} /></button>
                     </div>
                   )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div className="space-y-2">
                       <label className="text-[8px] uppercase tracking-widest text-gray-400 font-black">First Name</label>
                       {isEditingAddress ? <input value={formData.first_name} onChange={e => setFormData({...formData, first_name: e.target.value})} className="w-full border-b border-black text-xs uppercase tracking-widest outline-none py-1 bg-transparent" /> : <p className="text-sm font-bold uppercase tracking-widest">{formData.first_name || 'Not Documented'}</p>}
                    </div>
                    <div className="space-y-2">
                       <label className="text-[8px] uppercase tracking-widest text-gray-400 font-black">Last Name</label>
                       {isEditingAddress ? <input value={formData.last_name} onChange={e => setFormData({...formData, last_name: e.target.value})} className="w-full border-b border-black text-xs uppercase tracking-widest outline-none py-1 bg-transparent" /> : <p className="text-sm font-bold uppercase tracking-widest">{formData.last_name || 'Not Documented'}</p>}
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="space-y-2">
                       <label className="text-[8px] uppercase tracking-widest text-gray-400 font-black">Destination Silhouette</label>
                       {isEditingAddress ? (
                         <div className="space-y-4">
                           <input value={formData.address_line1} onChange={e => setFormData({...formData, address_line1: e.target.value})} placeholder="STREET" className="w-full border-b border-black text-xs uppercase tracking-widest outline-none py-1 bg-transparent" />
                           <div className="flex gap-4">
                              <input value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="CITY" className="w-1/2 border-b border-black text-xs uppercase tracking-widest outline-none py-1 bg-transparent" />
                              <input value={formData.postal_code} onChange={e => setFormData({...formData, postal_code: e.target.value})} placeholder="POSTAL" className="w-1/2 border-b border-black text-xs uppercase tracking-widest outline-none py-1 bg-transparent" />
                           </div>
                         </div>
                       ) : (
                         <div className="space-y-1">
                           <p className="text-sm font-bold uppercase tracking-widest">{formData.address_line1 || 'No destination'}</p>
                           <p className="text-[9px] uppercase tracking-widest text-gray-400">{formData.city} {formData.postal_code}</p>
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="lg:col-span-4 space-y-10">
              <div className="bg-black text-white p-10 space-y-8">
                 <h4 className="text-[10px] uppercase tracking-[0.4em] font-black">Core Protocols</h4>
                 <div className="space-y-6">
                   <button 
                     onClick={() => setIsChangingPassword(true)}
                     className="w-full flex items-center justify-between text-[9px] uppercase tracking-widest group hover:opacity-80 transition-opacity"
                   >
                     Rotate Credentials 
                     <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                   </button>
                 </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'acquisitions' && (
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="flex justify-between items-end border-b border-black pb-6">
              <div>
                <h2 className="font-serif-elegant text-4xl md:text-6xl font-bold uppercase tracking-tighter">Order Archive</h2>
                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mt-2">{orders.length} Documented Acquisitions</p>
              </div>
              <Link to="/orders" className="text-[9px] uppercase tracking-widest font-black underline underline-offset-4 hover:no-underline transition-all flex items-center gap-2">
                View Full Archive <ChevronRight size={12} />
              </Link>
            </div>

            {orders.length === 0 ? (
              <div className="py-20 text-center space-y-6">
                <Package size={64} strokeWidth={0.5} className="mx-auto text-gray-300" />
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-wider mb-2">No Acquisitions</h3>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Your order history will appear here</p>
                </div>
                <Link to="/" className="inline-block border border-black px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all">
                  Browse Collection
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                {orders.slice(0, 5).map(order => (
                  <div key={order.id} className="border border-black/10 hover:border-black transition-all group">
                    <div className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-black/5">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-bold uppercase tracking-widest">Order #{order.id}</span>
                          <span className={`px-3 py-1 text-[8px] uppercase tracking-widest font-black ${
                            order.status === 'paid' || order.status === 'completed' ? 'bg-green-100 text-green-800' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-[9px] uppercase tracking-[0.3em] text-gray-400">
                          {new Date(order.created_at).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric' 
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold">${order.total_amount.toFixed(2)}</p>
                        <p className="text-[8px] uppercase tracking-widest text-gray-400">{order.items.length} Item{order.items.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex gap-4 items-start">
                          <div className="w-16 h-16 bg-gray-100 border border-black/5 flex items-center justify-center shrink-0">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Package size={24} strokeWidth={0.5} className="text-gray-300" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold uppercase tracking-wider truncate">{item.name}</p>
                            <p className="text-[9px] uppercase tracking-widest text-gray-400 mt-1">${item.price.toFixed(2)}</p>
                          </div>
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
          <div className="space-y-10 animate-in fade-in duration-700">
            <div className="border-b border-black pb-6">
              <h2 className="font-serif-elegant text-4xl md:text-6xl font-bold uppercase tracking-tighter">Testimonials</h2>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black mt-2">{reviews.length} Reviews Documented</p>
            </div>

            {reviews.length === 0 ? (
              <div className="py-20 text-center space-y-6">
                <MessageSquare size={64} strokeWidth={0.5} className="mx-auto text-gray-300" />
                <div>
                  <h3 className="text-xl font-bold uppercase tracking-wider mb-2">No Reviews Yet</h3>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400">Your product reviews will appear here</p>
                </div>
                <Link to="/" className="inline-block border border-black px-8 py-4 text-[10px] uppercase tracking-[0.4em] font-black hover:bg-black hover:text-white transition-all">
                  Browse Collection
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {reviews.map(review => (
                  <div key={review.id} className="border border-black/10 hover:border-black transition-all p-8 space-y-6 group">
                    <div className="flex gap-6">
                      {review.product?.image_url && (
                        <div className="w-24 h-24 bg-gray-50 border border-black/5 overflow-hidden shrink-0">
                          <img 
                            src={review.product.image_url} 
                            alt={review.product.name} 
                            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500"
                          />
                        </div>
                      )}
                      <div className="flex-1 flex justify-between items-start gap-6">
                        <div className="flex-1">
                          <h4 className="text-sm font-bold uppercase tracking-wider">{review.product?.name || 'Product'}</h4>
                          <p className="text-[9px] uppercase tracking-[0.3em] text-gray-400 mt-1">
                            {new Date(review.date).toLocaleDateString('en-US', { 
                              year: 'numeric', 
                              month: 'long', 
                              day: 'numeric' 
                            })}
                          </p>
                          <p className="text-[8px] uppercase tracking-widest text-gray-400 mt-2">
                            By {review.author}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star 
                              key={i} 
                              size={16} 
                              className={i < review.rating ? 'fill-black' : 'fill-gray-200'} 
                              strokeWidth={0}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-700">{review.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Profile;